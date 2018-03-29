import { WrapperService } from "../test-dist/wrapperService";
import { NULL_ADDRESS, DefaultLogLevel } from "./helpers";
import { UpgradeSchemeWrapper } from "../test-dist/wrappers/upgradescheme";
import { LoggingService, LogLevel } from "../test-dist/loggingService";

describe("WrapperService", () => {
  it("has a working getContractWrapper() function", async () => {
    const wrapper = await WrapperService.getContractWrapper("UpgradeScheme");
    assert.isOk(wrapper);
    assert(wrapper instanceof UpgradeSchemeWrapper);
  });

  it("getContractWrapper() function handles bad wrapper name", async () => {
    const wrapper = await WrapperService.getContractWrapper("NoSuchScheme");
    assert.equal(wrapper, undefined);
  });

  it("getContractWrapper() function handles bad address", async () => {
    LoggingService.setLogLevel(LogLevel.none);
    const wrapper = await WrapperService.getContractWrapper("UpgradeScheme", NULL_ADDRESS);
    LoggingService.setLogLevel(DefaultLogLevel);
    assert.equal(wrapper, undefined);
  });
});
