"use strict";
import { AvatarService } from "./avatarService";
import { Address, fnVoid, Hash, SchemePermissions } from "./commonTypes";
import { ContractWrapperBase, DecodedLogEntryEvent } from "./contractWrapperBase";
import { Utils } from "./utils";
import { DaoCreator } from "./wrappers/daocreator";
import { ForgeOrgConfig, InitialSchemesSetEventResult } from "./wrappers/daocreator";
import { WrapperService } from "./wrapperService.js";

export class DAO {

  public static async new(opts: NewDaoConfig): Promise<DAO> {

    let daoCreator;

    if (opts.daoCreator) {
      daoCreator = await DaoCreator.at(opts.daoCreator);
    } else {
      daoCreator = WrapperService.wrappers.DaoCreator;
    }

    const result = await daoCreator.forgeOrg(opts);

    const avatarAddress = result.getValueFromTx("_avatar", "NewOrg");

    await daoCreator.setSchemes(Object.assign({ avatar: avatarAddress }, opts));

    return DAO.at(avatarAddress);
  }

  public static async at(avatarAddress: Address): Promise<DAO> {
    const dao = new DAO();

    const avatarService = new AvatarService(avatarAddress);
    dao.avatar = await avatarService.getAvatar();
    dao.controller = await avatarService.getController();
    dao.hasUController = avatarService.isUController;
    dao.token = await avatarService.getNativeToken();
    dao.reputation = await avatarService.getNativeReputation();

    return dao;
  }

  /**
   * Returns promise of the DAOstack Genesis avatar address, or undefined if not found
   */
  public static async getGenesisDao(daoCreatorAddress: Address): Promise<string> {
    return new Promise<string>(
      async (resolve: (address: Address) => void, reject: (ex: any) => void): Promise<void> => {
        try {
          const daoCreator =
            daoCreatorAddress ?
              await WrapperService.factories.DaoCreator.at(daoCreatorAddress) : WrapperService.wrappers.DaoCreator;
          let avatarAddress;
          const event = daoCreator.InitialSchemesSet({}, { fromBlock: 0 });
          /**
           * this first DAO returned will be DAOstack
           */
          event.get((err: any, log: Array<DecodedLogEntryEvent<InitialSchemesSetEventResult>>) => {
            avatarAddress = log[0].args._avatar;
            resolve(avatarAddress);
          });
        } catch (ex) {
          reject(ex);
        }
      });
  }

  public avatar: any;
  public controller: any;
  public hasUController: boolean;
  public token: any;
  public reputation: any;

  /**
   * returns schemes currently registered into this DAO, as Array<DaoSchemeInfo>
   * @param name like "SchemeRegistrar"
   */
  public async getSchemes(name: string): Promise<Array<DaoSchemeInfo>> {
    // return the schemes registered on this controller satisfying the contract spec
    // return all schemes if contract is not given
    const schemes = await this._getSchemes();
    if (name) {
      return schemes.filter((s: DaoSchemeInfo) => s.name === name);
    } else {
      return schemes;
    }
  }

  /**
   * returns schemes currently in this DAO as Array<DaoSchemeInfo>
   */
  public async _getSchemes(): Promise<Array<DaoSchemeInfo>> {
    // private method returns all registered schemes.
    // TODO: this is *expensive*, we need to cache the results (and perhaps poll for latest changes if necessary)
    const schemesMap = new Map<string, DaoSchemeInfo>();
    const controller = this.controller;
    const avatar = this.avatar;
    const arcTypesMap = new Map<Address, string>(); // <address: Address, name: string>
    const wrapperService = WrapperService.wrappersByType;

    /**
     * TODO:  This should pull in all known versions of the schemes, names
     * and versions in one fell swoop.
     */
    /* tslint:disable-next-line:forin */
    for (const name in wrapperService.allWrappers) {
      const contract = wrapperService.allWrappers[name];
      arcTypesMap.set(contract.address, name);
    }

    const registerSchemeEvent = controller.RegisterScheme(
      {},
      { fromBlock: 0, toBlock: "latest" }
    );

    await new Promise((resolve: fnVoid): void => {
      registerSchemeEvent.get((err: any, log: DecodedLogEntryEvent<ControllerRegisterSchemeEventLogEntry> |
        Array<DecodedLogEntryEvent<ControllerRegisterSchemeEventLogEntry>>) =>
        this._handleSchemeEvent(
          log,
          arcTypesMap,
          schemesMap
        ).then((): void => {
          resolve();
        })
      );
    });

    const registeredSchemes = [];

    for (const scheme of schemesMap.values()) {
      if (await controller.isSchemeRegistered(scheme.address, avatar.address)) {
        registeredSchemes.push(scheme);
      }
    }

    return registeredSchemes;
  }

  public async _handleSchemeEvent(
    log: DecodedLogEntryEvent<ControllerRegisterSchemeEventLogEntry> |
      Array<DecodedLogEntryEvent<ControllerRegisterSchemeEventLogEntry>>,
    arcTypesMap: Map<Address, string>,
    schemesMap: Map<string, DaoSchemeInfo>
  ): Promise<void> {

    if (!Array.isArray(log)) {
      log = [log];
    }
    const count = log.length;
    for (let i = 0; i < count; i++) {
      const schemeAddress = log[i].args._scheme;
      // will be all zeros if not registered
      const permissions = await this.controller.getSchemePermissions(schemeAddress, this.avatar.address);

      const schemeInfo = {
        address: schemeAddress,
        // will be undefined if not a known scheme
        name: arcTypesMap.get(schemeAddress),
        permissions: SchemePermissions.fromString(permissions),
      };

      // dedup
      schemesMap.set(schemeAddress, schemeInfo);
    }
  }

  /**
   * Returns an Arc.js contract wrapper or undefined if not found.
   * @param contract - name of an Arc contract, like "SchemeRegistrar"
   * @param address - optional
   */
  public async getContractWrapper(contract: string, address?: Address): Promise<ContractWrapperBase | undefined> {
    return WrapperService.getContractWrapper(contract, address);
  }

  /**
   * returns whether the scheme with the given name is registered to this DAO's controller
   */
  public async isSchemeRegistered(schemeAddress: Address): Promise<boolean> {
    return await this.controller.isSchemeRegistered(schemeAddress, this.avatar.address);
  }

  /**
   * Returns global constraints currently registered into this DAO, as Array<DaoGlobalConstraintInfo>
   * @param name like "TokenCapGC"
   */
  public async getGlobalConstraints(name: string): Promise<Array<DaoGlobalConstraintInfo>> {
    // return the global constraints registered on this controller satisfying the contract spec
    // return all global constraints if name is not given
    const constraints = await this._getConstraints();
    if (name) {
      return constraints.filter((s: DaoGlobalConstraintInfo) => s.name === name);
    } else {
      return constraints;
    }
  }

  /**
   * returns global constraints currently in this DAO, as DaoGlobalConstraintInfo
   */
  public async _getConstraints(): Promise<Array<DaoGlobalConstraintInfo>> {
    // TODO: this is *expensive*, we need to cache the results (and perhaps poll for latest changes if necessary)
    const constraintsMap = new Map<string, DaoGlobalConstraintInfo>(); // <string, DaoGlobalConstraintInfo>
    const controller = this.controller;
    const avatar = this.avatar;
    const arcTypesMap = new Map<Address, string>(); // <address: Address, name: string>
    const wrapperService = WrapperService.wrappersByType;

    /**
     * TODO:  This should pull in all known versions of the constraints, names
     * and versions in one fell swoop.
     */
    /* tslint:disable-next-line:forin */
    for (const name in wrapperService.allWrappers) {
      const contract = wrapperService.allWrappers[name];
      arcTypesMap.set(contract.address, name);
    }

    const event = controller.AddGlobalConstraint(
      {},
      { fromBlock: 0, toBlock: "latest" }
    );

    await new Promise((resolve: fnVoid): void => {
      event.get((err: any, log: DecodedLogEntryEvent<ControllerAddGlobalConstraintsEventLogEntry> |
        Array<DecodedLogEntryEvent<ControllerAddGlobalConstraintsEventLogEntry>>) =>
        this._handleConstraintEvent(
          log,
          arcTypesMap,
          constraintsMap
        ).then(() => {
          resolve();
        })
      );
    });

    const registeredConstraints = [];

    for (const gc of constraintsMap.values()) {
      if (await controller.isGlobalConstraintRegistered(gc.address, avatar.address)) {
        registeredConstraints.push(gc);
      }
    }

    return registeredConstraints;
  }

  public async _handleConstraintEvent(
    log: DecodedLogEntryEvent<ControllerAddGlobalConstraintsEventLogEntry> |
      Array<DecodedLogEntryEvent<ControllerAddGlobalConstraintsEventLogEntry>>,
    arcTypesMap: Map<Address, string>,
    constraintsMap: Map<string, DaoGlobalConstraintInfo>
  ): Promise<void> {
    if (!Array.isArray(log)) {
      log = [log];
    }
    const count = log.length;
    for (let i = 0; i < count; i++) {
      const address = log[i].args._globalConstraint;
      const paramsHash = log[i].args._params;

      const info = {
        address,
        // will be undefined if not a known scheme
        name: arcTypesMap.get(address),
        paramsHash,
      };

      // dedup
      constraintsMap.set(address, info);
    }
  }

  /**
   * Returns the name of the DAO as stored in the Avatar
   * @return {Promise<string>}
   */
  public async getName(): Promise<string> {
    return Utils.getWeb3().toUtf8(await this.avatar.orgName());
  }

  /**
   * Returns the token name for the DAO as stored in the native token
   * @return {Promise<string>}
   */
  public async getTokenName(): Promise<string> {
    return await this.token.name();
  }

  /**
   * Returns the token symbol for the DAO as stored in the native token
   * @return {Promise<string>}
   */
  public async getTokenSymbol(): Promise<string> {
    return await this.token.symbol();
  }
}

export interface NewDaoConfig extends ForgeOrgConfig {
  /**
   * The DaoCreator to use.  Default is the DaoCreator supplied in this release of Arc.js.
   */
  daoCreator?: string;
}

/**
 * Returned from DAO.getSchemes
 */
export interface DaoSchemeInfo {
  /**
   * Arc scheme name.  Will be undefined if not an Arc scheme.
   */
  name?: string;
  /**
   * Scheme address
   */
  address: string;
  /**
   * The scheme's permissions.
   * See ContractWrapperBase.getDefaultPermissions for what this string
   * looks like.
   */
  permissions: SchemePermissions;
}

/********************************
 * Returned from DAO.getGlobalConstraints
 */
export interface DaoGlobalConstraintInfo {
  name: string;
  address: string;
  paramsHash: string;
}

interface ControllerAddGlobalConstraintsEventLogEntry {
  _globalConstraint: Address;
  _params: Hash;
}

interface ControllerRegisterSchemeEventLogEntry {
  _scheme: Address;
}
