import { Address } from "./commonTypes";
import { ConfigService } from "./configService";
import { IConfigService } from "./iConfigService";
import { IContractWrapper, IContractWrapperFactory } from "./iContractWrapperBase";
import { LoggingService } from "./loggingService";
import { Utils } from "./utils";
import { Web3EventService } from "./web3EventService";
import { TransactionService } from "./transactionService";

/**
 * Generic class factory for all of the contract wrapper classes.
 */
export class ContractWrapperFactory<TWrapper extends IContractWrapper>
  implements IContractWrapperFactory<TWrapper> {

  public static setConfigService(configService: IConfigService): void {
    ContractWrapperFactory.configService = configService;
  }

  /**
   * this is a Map keyed by contract name of a Map keyed by address to an `IContractWrapper`
   */
  private static contractCache: Map<string, Map<Address, IContractWrapper>>
    = new Map<string, Map<Address, IContractWrapper>>();

  private static configService: IConfigService;

  private solidityContract: any;

  /**
   * Connstructor to create a contract wrapper factory for the given
   * Arc contract name and wrapper class.
   * @param solidityContract Name of the contract
   * @param wrapper - Class of the contract
   */
  public constructor(
    private solidityContractName: string,
    private wrapper: new (solidityContract: any, web3EventService: Web3EventService) => TWrapper,
    private web3EventService: Web3EventService) {
  }

  /**
   * Deploy a new instance of the contract and return a wrapper around it.
   * 
   * Will estimate gas and gasPrice if so configured.  Important: In that case,
   * if the last parameter is an object that contains `gas`, `gasLimit`, `from` or `data`
   * properties then it is assumed to be a web3Params object.
   * 
   * @param rest Optional arguments to the Arc contracts constructor.
   */
  public async new(...rest: Array<any>): Promise<TWrapper> {
    await this.ensureSolidityContract();

    if (ConfigService.get("estimateGas")) {
      let web3Params = {};
      /**
       * if a web3Params object is sitting on the end, remove it and pass it separately
       * into paramsForOptimalGasParameters.
       */
      if (rest && rest.length) {
        const lastParam = rest[rest.length - 1];

        if ((typeof (lastParam.gas) !== "undefined") ||
          (typeof (lastParam.gasLimit) !== "undefined") ||
          (typeof (lastParam.from) !== "undefined") ||
          (typeof (lastParam.data) !== "undefined")) {

          web3Params = rest.splice(rest.length - 1, 1)[0];
        }
      }

      web3Params = TransactionService.paramsForOptimalGasParameters(
        this.solidityContract.new, rest, web3Params)

      rest = rest.concat(web3Params);
    }

    const hydratedWrapper =
      await new this.wrapper(this.solidityContract, this.web3EventService).hydrateFromNew(...rest);

    if (hydratedWrapper && ContractWrapperFactory.configService.get("cacheContractWrappers")) {
      this.setCachedContract(this.solidityContractName, hydratedWrapper);
    }
    return hydratedWrapper;
  }

  /**
   * Return a wrapper around the contract, hydrated from the given address.
   * Returns undefined if not found.
   * @param address
   */
  public async at(address: string): Promise<TWrapper> {
    await this.ensureSolidityContract();

    const getWrapper = (): Promise<TWrapper> => {
      return new this.wrapper(this.solidityContract, this.web3EventService).hydrateFromAt(address);
    };

    return this.getHydratedWrapper(getWrapper, address);
  }

  /**
   * Return a wrapper around the contract as deployed by the current version of Arc.js.
   * Note this is usually not needed as the WrapperService provides these
   * wrappers already hydrated.
   * Returns undefined if not found.
   */
  public async deployed(): Promise<TWrapper> {
    await this.ensureSolidityContract();

    const getWrapper = (): Promise<TWrapper> => {
      return new this.wrapper(this.solidityContract, this.web3EventService).hydrateFromDeployed();
    };

    return this.getHydratedWrapper(getWrapper);
  }

  public async ensureSolidityContract(): Promise<any> {
    if (!this.solidityContract) {
      this.solidityContract = await Utils.requireContract(this.solidityContractName);
    }
    return this.solidityContract;
  }

  private async getHydratedWrapper(
    getWrapper: () => Promise<TWrapper>,
    address?: Address): Promise<TWrapper> {

    let hydratedWrapper: TWrapper;
    if (ContractWrapperFactory.configService.get("cacheContractWrappers")) {
      if (!address) {
        try {
          address = this.solidityContract.address;
        } catch {
          // the contract has not been deployed, so can't get it's address
        }
      }

      if (address) {
        hydratedWrapper = this.getCachedContract(this.solidityContractName, address) as TWrapper;
        if (hydratedWrapper) {
          LoggingService.debug(`ContractWrapperFactory: obtained wrapper from cache: ${hydratedWrapper.address}`);
        }
      }

      if (!hydratedWrapper) {
        hydratedWrapper = await getWrapper();
        if (hydratedWrapper) {
          this.setCachedContract(this.solidityContractName, hydratedWrapper);
        }
      }
    } else {
      hydratedWrapper = await getWrapper();
    }
    return hydratedWrapper;
  }

  private getCachedContract(name: string, at: string): IContractWrapper | undefined {
    if (!at) {
      return undefined;
    }
    const addressMap = ContractWrapperFactory.contractCache.get(name);
    if (!addressMap) {
      return undefined;
    }
    return addressMap.get(at);
  }

  private setCachedContract(
    name: string,
    wrapper: IContractWrapper): void {

    if (wrapper) {
      let addressMap = ContractWrapperFactory.contractCache.get(name);
      if (!addressMap) {
        addressMap = new Map<Address, IContractWrapper>();
        ContractWrapperFactory.contractCache.set(name, addressMap);
      }
      addressMap.set(wrapper.address, wrapper);
    }
  }
}
