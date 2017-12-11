import { Organization } from '../lib/organization.js';
import { getValueFromLogs, requireContract } from '../lib/utils.js';
const Controller = requireContract("Controller");
const AbsoluteVote = requireContract('AbsoluteVote');
const UpgradeScheme = requireContract('UpgradeScheme');
import { forgeOrganization, settingsForTest, SOME_HASH } from './helpers';


contract('UpgradeScheme', (accounts) => {
  before(() => {
    helpers.etherForEveryone();
  });

  it("proposeController javascript wrapper should change controller", async () => {
    const organization = await forgeOrganization();

    const upgradeScheme = await organization.scheme('UpgradeScheme');
    const newController = await Controller.new(null, null, null, [], [], []);

    assert.equal(await organization.controller.newController(), helpers.NULL_ADDRESS, "there is already a new contoller");

    const tx = await upgradeScheme.proposeController({
      avatar: organization.avatar.address,
      controller: newController.address
    });

    // newUpgradeScheme.registerOrganization(organization.avatar.address);

    const proposalId = getValueFromLogs(tx, '_proposalId');

    organization.vote(proposalId, 1, {from: accounts[2]});

    // now the ugprade should have been executed
    assert.equal(await organization.controller.newController(), newController.address);

    // avatar, token and reputation ownership shold have been transferred to the new controller
    assert.equal(await organization.token.owner(), newController.address);
    assert.equal(await organization.reputation.owner(), newController.address);
    assert.equal(await organization.avatar.owner(), newController.address);
  });

  it('controller upgrade should work as expected', async () => {
    const founders = [
      {
        address: accounts[0],
        reputation: 30,
        tokens: 30,
      },
      {
        address: accounts[1],
        reputation: 70,
        tokens: 70,
      }
    ];
    const organization = await Organization.new({
      orgName: 'Skynet',
      tokenName: 'Tokens of skynet',
      tokenSymbol: 'SNT',
      founders,
    });

    const upgradeScheme = await organization.scheme('UpgradeScheme');
    const settings = await settingsForTest();
    const votingMachine = await AbsoluteVote.at(settings.votingMachine);

    // the organization has not bene upgraded yet, so newController is the NULL address
    assert.equal(await organization.controller.newController(), helpers.NULL_ADDRESS);

    // we create a new controller to upgrade to
    const newController = await Controller.new(null, null, null, [], [], []);
    let tx = await upgradeScheme.proposeUpgrade(organization.avatar.address, newController.address);

    const proposalId = getValueFromLogs(tx, '_proposalId');
    // now vote with the majority for the proposal
    tx = await votingMachine.vote(proposalId, 1, {from: accounts[1]});

    // now the ugprade should have been executed
    assert.equal(await organization.controller.newController(), newController.address);

    // avatar, token and reputation ownership shold have been transferred to the new controller
    assert.equal(await organization.token.owner(), newController.address);
    assert.equal(await organization.reputation.owner(), newController.address);
    assert.equal(await organization.avatar.owner(), newController.address);

    // TODO: we also want to reflect this upgrade in our Controller object!
  });

  it("proposeUpgradingScheme javascript wrapper should change upgrade scheme", async () => {
    const organization = await forgeOrganization();

    const upgradeScheme = await organization.scheme('UpgradeScheme');

    const newUpgradeScheme = await UpgradeScheme.new(organization.token.address, 0, accounts[0]);

    assert.isFalse(await organization.controller.isSchemeRegistered(newUpgradeScheme.address), "new scheme is already registered into the controller");
    assert.isTrue(await organization.controller.isSchemeRegistered(upgradeScheme.address), "original scheme is not registered into the controller");

    const tx = await upgradeScheme.proposeUpgradingScheme({
      avatar: organization.avatar.address,
      scheme: newUpgradeScheme.address,
      schemeParametersHash: await organization.controller.getSchemeParameters(upgradeScheme.address)
    });

    // newUpgradeScheme.registerOrganization(organization.avatar.address);

    const proposalId = getValueFromLogs(tx, '_proposalId');

    organization.vote(proposalId, 1, {from: accounts[2]});

    assert.isTrue(await organization.controller.isSchemeRegistered(newUpgradeScheme.address), "new scheme is not registered into the controller");
  });


  it("proposeUpgradingScheme javascript wrapper should modify the modifying scheme", async () => {

    const organization = await forgeOrganization();

    const upgradeScheme = await organization.scheme('UpgradeScheme');

    assert.isTrue(await organization.controller.isSchemeRegistered(upgradeScheme.address), "upgrade scheme is not registered into the controller");

    const tx = await upgradeScheme.proposeUpgradingScheme({
      avatar: organization.avatar.address,
      scheme: upgradeScheme.address,
      schemeParametersHash: SOME_HASH
    });

    // newUpgradeScheme.registerOrganization(organization.avatar.address);

    const proposalId = getValueFromLogs(tx, '_proposalId');

    organization.vote(proposalId, 1, {from: accounts[2]});

    assert.isTrue(await organization.controller.isSchemeRegistered(upgradeScheme.address), "upgrade scheme is no longer registered into the controller");

    assert.equal(await organization.controller.getSchemeParameters(upgradeScheme.address), SOME_HASH, "parameters were not updated");
  });
});