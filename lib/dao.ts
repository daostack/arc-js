"use strict";
import BigNumber from "bignumber.js";
import { EntityFetcherFactory, Web3EventService } from ".";
import { AvatarService } from "./avatarService";
import { Address, fnVoid, Hash } from "./commonTypes";
import { DecodedLogEntryEvent, IContractWrapperBase } from "./iContractWrapperBase";
import { TransactionService } from "./transactionService";
import { Utils } from "./utils";
import { DaoCreatorFactory, DaoCreatorWrapper } from "./wrappers/daoCreator";
import { ForgeOrgConfig, InitialSchemesSetEventResult, SchemesConfig } from "./wrappers/daoCreator";
import { WrapperService } from "./wrapperService";

/**
 * Helper class and factory for DAOs.
 */
export class DAO {

  /**
   * Returns the promise of a new DAO
   * @param {NewDaoConfig} options Configuration of the new DAO
   */
  public static async new(options: NewDaoConfig): Promise<DAO> {

    let daoCreator: DaoCreatorWrapper;

    if (options.daoCreatorAddress) {
      daoCreator = await DaoCreatorFactory.at(options.daoCreatorAddress);
    } else {
      daoCreator = WrapperService.wrappers.DaoCreator;
    }

    const payload = TransactionService.publishKickoffEvent(
      "DAO.new",
      options,
      daoCreator.forgeOrgTransactionsCount(options) + daoCreator.setSchemesTransactionsCount(options)
    );

    /**
     * resend sub-events as Dao.new
     */
    const eventContext = TransactionService.newTxEventContext("DAO.new", payload, options);

    options.txEventStack = eventContext;

    const result = await (await daoCreator.forgeOrg(options)).watchForTxMined();

    const avatarAddress = TransactionService.getValueFromLogs(result, "_avatar", "NewOrg");

    if (!avatarAddress) {
      throw new Error("avatar address is not defined");
    }

    // In case forgeOrg ever may decide to alter options.txEventStack, reset it here
    options.txEventStack = eventContext;

    await (await daoCreator.setSchemes(Object.assign({ avatar: avatarAddress }, options))).watchForTxMined();

    return DAO.at(avatarAddress);
  }

  /**
   * Returns the promise of a DAO at the given address.  Returns undefined if not found.
   * @param avatarAddress The DAO avatar's address
   */
  public static async at(avatarAddress: Address): Promise<DAO> {
    let dao;
    const avatarService = new AvatarService(avatarAddress);
    const avatar = await avatarService.getAvatar();

    if (avatar) {
      dao = new DAO();

      dao.avatar = await avatarService.getAvatar();
      dao.controller = await avatarService.getController();
      dao.hasUController = avatarService.isUController;
      dao.token = await avatarService.getNativeToken();
      dao.reputation = await avatarService.getNativeReputation();

      return dao;
    }
  }

  /**
   * Return a promise of an array of avatar addresses for all of the DAOs created by the optionally-given
   * DaoCreator contract.  The default DaoCreator is the one deployed by
   * the running version of Arc.js.
   *
   * An alternative DaoCreator must implement an InitialSchemesSet event just like the
   * Arc DaoCreater.
   * @param options
   */
  public static async getDaos(options: GetDaosOptions = {}): Promise<Array<Address>> {
    const daoEventFetcherFactory = await DAO.getDaoCreationEvents(options);
    return daoEventFetcherFactory({}, { fromBlock: 0 }).get();
  }

  /**
   * Return a promise of an EntityFetcherFactory to get/watch avatar addresses
   * for all of the DAOs created by the optionally-given DaoCreator contract.
   * The default DaoCreator is the one deployed by the running version of Arc.js.
   *
   * An alternative DaoCreator must implement an InitialSchemesSet event just like the Arc DaoCreater.
   * @param options Optional, default is `{}`.
   */
  public static async getDaoCreationEvents(options: GetDaosOptions = {}):
    Promise<EntityFetcherFactory<Address, InitialSchemesSetEventResult>> {

    const web3EventService = new Web3EventService();
    const daoCreator =
      options.daoCreatorAddress ?
        await WrapperService.factories.DaoCreator
          .at(options.daoCreatorAddress) : WrapperService.wrappers.DaoCreator;

    return web3EventService.createEntityFetcherFactory(
      daoCreator.InitialSchemesSet,
      async (args: InitialSchemesSetEventResult): Promise<Address> => {
        return Promise.resolve(args._avatar);
      });
  }

  /**
   * Truffle contract wrapper for the DAO's Avatar
   */
  public avatar: any;
  /**
   * Truffle contract wrapper for the DAO's controller (Controller or UController by default, see DAO.hasUController)
   */
  public controller: any;
  /**
   * `true` if the DAO is using Arc's universal controller
   */
  public hasUController: boolean;
  /**
   * Truffle contract wrapper for the DAO's native token (DAOToken by default)
   */
  public token: any;
  /**
   * Truffle contract wrapper for the DAO's native reputation (Reputation)
   */
  public reputation: any;

  /**
   * Returns the promise of all of the schemes registered into this DAO, as Array<DaoSchemeInfo>
   * @param name Optionally filter by the name of a scheme, like "SchemeRegistrar"
   */
  public async getSchemes(name?: string): Promise<Array<DaoSchemeInfo>> {
    const schemes = await this._getSchemes();
    if (name) {
      return schemes.filter((s: DaoSchemeInfo) => s.wrapper && s.wrapper.name && (s.wrapper.name === name));
    } else {
      return schemes;
    }
  }
  /**
   * Returns the promise of all os the global constraints currently registered into this DAO,
   * as Array<DaoGlobalConstraintInfo>
   * @param name Optionally filter by the name of a global constraint, like "TokenCapGC"
   */
  public async getGlobalConstraints(name?: string): Promise<Array<DaoGlobalConstraintInfo>> {
    // return the global constraints registered on this controller satisfying the contract spec
    // return all global constraints if name is not given
    const constraints = await this._getConstraints();
    if (name) {
      return constraints.filter((s: DaoGlobalConstraintInfo) => s.wrapper.name && (s.wrapper.name === name));
    } else {
      return constraints;
    }
  }

  /**
   * Returns whether the scheme with the given address is registered to this DAO's controller
   */
  public async isSchemeRegistered(schemeAddress: Address): Promise<boolean> {
    return await this.controller.isSchemeRegistered(schemeAddress, this.avatar.address);
  }

  /**
   * Returns whether the global constraint with the given address is registered to this DAO's controller
   */
  public async isGlobalConstraintRegistered(gc: Address): Promise<boolean> {
    return await this.controller.isGlobalConstraintRegistered(gc, this.avatar.address);
  }

  /**
   * Returns the promise of the name of the DAO as stored in the Avatar
   * @return {Promise<string>}
   */
  public async getName(): Promise<string> {
    const web3 = await Utils.getWeb3();
    return web3.toUtf8(await this.avatar.orgName());
  }

  /**
   * Returns a promise of the given account's native token balance.
   * @param agentAddress
   */
  public async getTokenBalance(agentAddress: Address): Promise<BigNumber> {
    return Utils.getTokenBalance(agentAddress, this.token.address);
  }
  /**
   * Returns the promise of the  token name for the DAO as stored in the native token
   * @return {Promise<string>}
   */
  public async getTokenName(): Promise<string> {
    return await this.token.name();
  }

  /**
   * Returns  the promise of the token symbol for the DAO as stored in the native token
   * @return {Promise<string>}
   */
  public async getTokenSymbol(): Promise<string> {
    return await this.token.symbol();
  }

  /**
   * Returns promise of schemes currently in this DAO as Array<DaoSchemeInfo>
   */
  private async _getSchemes(): Promise<Array<DaoSchemeInfo>> {
    const foundSchemes = new Map<string, DaoSchemeInfo>();
    const controller = this.controller;
    const avatar = this.avatar;

    const registerSchemeEvent = controller.RegisterScheme(
      {},
      { fromBlock: 0, toBlock: "latest" }
    );

    await new Promise((resolve: fnVoid, reject: (error: Error) => void): void => {
      registerSchemeEvent.get((
        err: Error,
        log: DecodedLogEntryEvent<ControllerRegisterSchemeEventLogEntry> |
          Array<DecodedLogEntryEvent<ControllerRegisterSchemeEventLogEntry>>) => {
        if (err) {
          return reject(err);
        }
        this._handleSchemeEvent(log, foundSchemes)
          .then((): void => {
            resolve();
          });
      }
      );
    });

    const registeredSchemes = [];

    for (const scheme of foundSchemes.values()) {
      if (await controller.isSchemeRegistered(scheme.address, avatar.address)) {
        registeredSchemes.push(scheme);
      }
    }

    return registeredSchemes;
  }

  private async _handleSchemeEvent(
    log: DecodedLogEntryEvent<ControllerRegisterSchemeEventLogEntry> |
      Array<DecodedLogEntryEvent<ControllerRegisterSchemeEventLogEntry>>,
    schemesMap: Map<string, DaoSchemeInfo>
  ): Promise<void> {

    if (!Array.isArray(log)) {
      log = [log];
    }
    const count = log.length;
    for (let i = 0; i < count; i++) {
      const address = log[i].args._scheme;
      const wrapper = WrapperService.wrappersByAddress.get(address);

      const schemeInfo: DaoSchemeInfo = {
        address,
        // will be undefined if not an Arc scheme deployed by the running version of Arc.js
        // TODO: this should be aware of previously-deployed schemes
        wrapper,
      };

      // dedup
      schemesMap.set(address, schemeInfo);
    }
  }

  /**
   * Returns promise of global constraints currently in this DAO, as DaoGlobalConstraintInfo
   */
  private async _getConstraints(): Promise<Array<DaoGlobalConstraintInfo>> {
    const foundConstraints = new Map<string, DaoGlobalConstraintInfo>(); // <string, DaoGlobalConstraintInfo>
    const controller = this.controller;

    const event = controller.AddGlobalConstraint(
      {},
      { fromBlock: 0, toBlock: "latest" }
    );

    await new Promise((resolve: fnVoid, reject: (error: Error) => void): void => {
      event.get((
        err: any,
        log: DecodedLogEntryEvent<ControllerAddGlobalConstraintsEventLogEntry> |
          Array<DecodedLogEntryEvent<ControllerAddGlobalConstraintsEventLogEntry>>) => {
        if (err) {
          return reject(err);
        }
        this._handleConstraintEvent(log, foundConstraints).then(() => {
          resolve();
        });
      });
    });

    const registeredConstraints = [];

    for (const gc of foundConstraints.values()) {
      if (await this.isGlobalConstraintRegistered(gc.address)) {
        registeredConstraints.push(gc);
      }
    }

    return registeredConstraints;
  }

  private async _handleConstraintEvent(
    log: DecodedLogEntryEvent<ControllerAddGlobalConstraintsEventLogEntry> |
      Array<DecodedLogEntryEvent<ControllerAddGlobalConstraintsEventLogEntry>>,
    constraintsMap: Map<string, DaoGlobalConstraintInfo>
  ): Promise<void> {
    if (!Array.isArray(log)) {
      log = [log];
    }
    const count = log.length;
    for (let i = 0; i < count; i++) {
      const address = log[i].args._globalConstraint;
      const paramsHash = log[i].args._params;
      const wrapper = WrapperService.wrappersByAddress.get(address);

      const info: DaoGlobalConstraintInfo = {
        address,
        paramsHash,
        // will be undefined if not an Arc GC deployed by the running version of Arc.js
        // TODO: this should be aware of previously-deployed GCs
        wrapper,
      };

      // dedup
      constraintsMap.set(address, info);
    }
  }
}

export interface NewDaoConfig extends ForgeOrgConfig, SchemesConfig {
  /**
   * Address of a DaoCreator to use.  Default is the Arc DaoCreator supplied in this release of Arc.js.
   * If given, the current Arc.js wrapper class must be compatible with Arc contract at the given address.
   */
  daoCreatorAddress?: Address;
}

/**
 * Returned from DAO.getSchemes
 */
export interface DaoSchemeInfo {
  /**
   * Scheme address
   */
  address: string;
  /**
   * Wrapper class for the scheme if it was deployed by the running version of Arc.js
   */
  wrapper?: IContractWrapperBase;
}

/********************************
 * Returned from DAO.getGlobalConstraints
 */
export interface DaoGlobalConstraintInfo {
  /**
   * Global constraint address
   */
  address: string;
  /**
   * Wrapper class for the constraint if it was deployed by the running version of Arc.js
   */
  wrapper: IContractWrapperBase;
  /**
   * hash of the constraint parameters
   */
  paramsHash: string;
}

export interface ControllerAddGlobalConstraintsEventLogEntry {
  _globalConstraint: Address;
  _params: Hash;
}

export interface ControllerRegisterSchemeEventLogEntry {
  _scheme: Address;
}

export type PerDaoCallback = (avatarAddress: Address) => void | Promise<boolean>;

export interface GetDaosOptions {
  daoCreatorAddress?: Address;
}
