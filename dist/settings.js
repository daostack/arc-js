'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getSettings = undefined;

var _utils = require('./utils.js');

var _globalconstraintregistrar = require('./globalconstraintregistrar.js');

var _schemeregistrar = require('./schemeregistrar.js');

var _simplecontributionscheme = require('./simplecontributionscheme.js');

var _absoluteVote = require('./absoluteVote.js');

var _tokenCapGC = require('./tokenCapGC.js');

var _upgradescheme = require('./upgradescheme.js');

var GenesisScheme = (0, _utils.requireContract)("GenesisScheme");

/**
   * These are uninitialized instances of ExtendTruffleContract,
   * effectively class factories.
 */


var getSettings = async function getSettings() {
  /**
   * These are deployed contract instances represented by their respective Arc
   * javascript wrappers (ExtendTruffleContract).
   *
   * `deployed()` is a static method on each of those classes.
   **/
  var contributionScheme = await _simplecontributionscheme.SimpleContributionScheme.deployed();
  var genesisScheme = await GenesisScheme.deployed();
  var globalConstraintRegistrar = await _globalconstraintregistrar.GlobalConstraintRegistrar.deployed();
  var schemeRegistrar = await _schemeregistrar.SchemeRegistrar.deployed();
  var tokenCapGC = await _tokenCapGC.TokenCapGC.deployed();
  var upgradeScheme = await _upgradescheme.UpgradeScheme.deployed();
  var absoluteVote = await _absoluteVote.AbsoluteVote.deployed();

  /**
   * `contract` here is an uninitialized instance of ExtendTruffleContract,
   * basically the class factory.
   * Calling contract.at() (a static method on the class) will return a
   * the properly initialized instance of ExtendTruffleContract.
   */
  return {
    votingMachine: absoluteVote.address,
    daostackContracts: {
      SimpleContributionScheme: {
        contract: _simplecontributionscheme.SimpleContributionScheme,
        address: contributionScheme.address
      },
      GenesisScheme: {
        contract: GenesisScheme,
        address: genesisScheme.address
      },
      GlobalConstraintRegistrar: {
        contract: _globalconstraintregistrar.GlobalConstraintRegistrar,
        address: globalConstraintRegistrar.address
      },
      SchemeRegistrar: {
        contract: _schemeregistrar.SchemeRegistrar,
        address: schemeRegistrar.address
      },
      TokenCapGC: {
        contract: _tokenCapGC.TokenCapGC,
        address: tokenCapGC.address
      },
      UpgradeScheme: {
        contract: _upgradescheme.UpgradeScheme,
        address: upgradeScheme.address
      },
      AbsoluteVote: {
        contract: _absoluteVote.AbsoluteVote,
        address: absoluteVote.address
      }
    }
  };
};

exports.getSettings = getSettings;