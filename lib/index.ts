/* tslint:disable:no-var-requires */
/* tslint:disable-next-line:no-reference */
/// <reference path="../custom_typings/web3.d.ts" />
export * from "./accountService";
export * from "./avatarService";
export * from "./commonTypes";
export * from "./configService";
export {
  ContractWrappers,
  ContractWrapperFactories,
  ContractWrappersByType,
  ContractWrappersByAddress
} from "./wrapperService";
export * from "./wrapperService";
export * from "./wrappers/absoluteVote";
export * from "./wrappers/commonEventInterfaces";
export * from "./wrappers/contributionReward";
export * from "./wrappers/daoCreator";
export * from "./wrappers/daoToken";
export * from "./wrappers/locking4Reputation";
export * from "./wrappers/lockingEth4Reputation";
export * from "./wrappers/lockingToken4Reputation";
export * from "./wrappers/fixedReputationAllocation";
export * from "./wrappers/externalLocking4Reputation";
export * from "./wrappers/auction4Reputation";
export * from "./wrappers/genesisProtocol";
export * from "./wrappers/globalConstraintRegistrar";
export * from "./wrappers/iBurnableToken";
export * from "./wrappers/iErc827Token";
export * from "./iConfigService";
export * from "./wrappers/iIntVoteInterface";
export * from "./wrappers/intVoteInterface";
export * from "./wrappers/mintableToken";
export * from "./wrappers/redeemer";
export * from "./wrappers/reputation";
export * from "./wrappers/schemeRegistrar";
export * from "./wrappers/standardToken";
export * from "./wrappers/tokenCapGC";
export * from "./wrappers/upgradeScheme";
export * from "./wrappers/vestingScheme";
export * from "./wrappers/voteInOrganizationScheme";
export * from "./iContractWrapperBase";
export * from "./dao";
export * from "./contractWrapperBase";
export * from "./contractWrapperFactory";
export * from "./pubSubEventService";
export * from "./web3EventService";
export * from "./proposalService";
export * from "./proposalGeneratorBase";
export * from "./loggingService";
export * from "./transactionService";
export * from "./utils";

import { Web3 } from "web3";
import { AccountService } from "./accountService";
import { ConfigService } from "./configService";
import { ContractWrapperFactory } from "./contractWrapperFactory";
import { LoggingService, LogLevel } from "./loggingService";
import { PubSubEventService } from "./pubSubEventService";
import { Utils } from "./utils";
import { WrapperService, WrapperServiceInitializeOptions } from "./wrapperService";

/**
 * Options for [InitializeArcJs](/api/README/#initializearcjs)
 */
export interface InitializeArcOptions extends WrapperServiceInitializeOptions {
  /**
   * If `true` and `window.ethereum` is present, instantiate Web3 using it as the provider.
   * Ignored if `useWeb3` is given.
   * Default is true.
   */
  useMetamaskEthereumWeb3Provider?: boolean;
  /**
   * Name of the network for which to use the defaults found in Arc.js/truffle.js.
   * Overwrites config settings network, providerUrl and providerPort.
   * See [Network settings](Home#networksettings) for more information.
   */
  useNetworkDefaultsFor?: string;
  /**
   * Optionally use the given Web3 instance, already initialized by a provider.
   * `useMetamaskEthereumWeb3Provider` is ignored if this is given.
   * Has the side-effect of setting `global.web3` to the given value.
   */
  useWeb3?: Web3;
  /**
   * Set to true to watch for changes in the current user account.
   * Default is false.  See [AccountService.initiateAccountWatch](/api/classes/AccountService#initiateAccountWatch).
   */
  watchForAccountChanges?: boolean;
  /**
   * Set to true to watch for changes in the current blockchain network.
   * Default is false.  See [AccountService.initiateNetworkWatch](/api/classes/AccountService#initiateNetworkWatch).
   */
  watchForNetworkChanges?: boolean;
}
/**
 * You must call `InitializeArcJs` before doing anything else with Arc.js.
 * Call it again whenever the current chain changes.
 * @returns Promise of the `Web3` object for the current chain.
 */
export async function InitializeArcJs(options: InitializeArcOptions = {}): Promise<Web3> {
  LoggingService.info("Initializing Arc.js");
  try {

    if (options.useWeb3) {
      // Utils.getWeb3 will pick this up
      (global as any).web3 = options.useWeb3;
    } else if (typeof (options.useMetamaskEthereumWeb3Provider) === "undefined") {
      options.useMetamaskEthereumWeb3Provider = true;
    }

    ConfigService.set("useMetamaskEthereumWeb3Provider", options.useMetamaskEthereumWeb3Provider);

    /**
     * simulate dependency injection, avoid circular dependencies
     */
    ContractWrapperFactory.setConfigService(ConfigService);
    ContractWrapperFactory.clearContractCache();
    /**
     * Initialize LoggingService here to avoid circular dependency involving ConfigService and PubSubService
     */
    LoggingService.logLevel = parseInt(ConfigService.get("logLevel"), 10) as LogLevel;
    /**
     * Watch for changes in logLevel via ConfigService.
     */
    PubSubEventService.subscribe(`ConfigService.settingChanged.logLevel`, (topics: string, value: number): void => {
      LoggingService.logLevel = parseInt(value as any, 10) as LogLevel;
    });

    if (options.useNetworkDefaultsFor) {
      const networkDefaults = ConfigService.get("networkDefaults")[options.useNetworkDefaultsFor];
      if (!networkDefaults) {
        throw new Error(`truffle network defaults not found: ${options.useNetworkDefaultsFor}`);
      }

      ConfigService.set("providerPort", networkDefaults.port);
      ConfigService.set("providerUrl", `${networkDefaults.host}`);
    }

    const web3 = await Utils.getWeb3(true);
    await WrapperService.initialize(options);

    if (options.watchForAccountChanges) {
      await AccountService.initiateAccountWatch();
    }

    if (options.watchForNetworkChanges) {
      await AccountService.initiateNetworkWatch();
    }

    return web3;
  } catch (ex) {
    /* tslint:disable-next-line:no-bitwise */
    LoggingService.message(`InitializeArcJs failed: ${ex}`, LogLevel.info | LogLevel.error);
    throw new Error(`InitializeArcJs failed: ${ex}`);
  }
}
