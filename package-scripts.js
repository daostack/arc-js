/* eslint-disable quotes */
const fs = require("fs");
const {
  series,
  //  crossEnv,
  //  concurrent,
  rimraf,
  copy,
  //  ifWindows,
  runInNewWindow,
  mkdirp
} = require("nps-utils");
const env = require("env-variable")();
const joinPath = require("path.join");
const cwd = require("cwd")();
const Config = require("./config/default.json");
/**
 * environment variables you can use to configure stuff like migrateContracts
 */
const pathArcJsRoot = env.pathArcJsRoot || cwd;

const pathArcJsContracts =
  env.pathArcJsContracts || joinPath(pathArcJsRoot, "migrated_contracts");

const pathDaostackArcRepo =
  env.pathDaostackArcRepo ||
  joinPath(pathArcJsRoot, "node_modules/@daostack/arc");

const pathArcTest =
  env.pathArcTest ||
  joinPath(pathArcJsRoot, "test");

const pathArcTestBuild =
  env.pathArcTestBuild ||
  joinPath(pathArcJsRoot, "test-dist");

const pathDaostackArcGanacheDb = joinPath(pathArcJsRoot, "ganacheDb");
const pathDaostackArcGanacheDbZip = joinPath(pathArcJsRoot, "ganacheDb.zip");

const network = env.network || Config.network || "ganache";

// this is needed to force travis to use our modified version of truffle
const truffleIsInternal = fs.existsSync(joinPath(pathArcJsRoot, "node_modules", "truffle-core-migrate-without-compile"));
const truffleCommand = `node ${joinPath(pathArcJsRoot, truffleIsInternal ? "node_modules" : "../../", "truffle-core-migrate-without-compile", "cli")}`;

module.exports = {
  scripts: {
    lint: {
      default: series(
        "nps lint.ts",
        "nps lint.js"
      ),
      ts: {
        default: "tslint --project .",
        andFix: "nps \"lint.ts --fix\""
      },
      js: {
        default: "eslint .",
        andFix: "nps \"lint.js --fix\""
      },
      andFix: series(
        "nps lint.ts.andFix",
        "nps lint.js.andFix"
      )
    },
    test: {
      default: series("nps lint", "nps test.automated"),
      automated: {
        /**
         * if you want to run an individual script module, you can do it like this:
         *
         *   npm start "test.automated ./test/dao.js"
         *
         * to also bail:
         *
         *   npm start "test.automated --bail ./test/dao.js"
         *
         */
        default: series(
          "nps test.build",
          "mocha --require babel-register --require babel-polyfill --require chai --timeout 999999"),
        bail: series(
          'nps "test.automated --bail"'
        ),
      },
      watch: series(
        'nps "test.automated --watch"'
      ),
      bail: (
        'nps test.automated.bail'
      ),
      ganache: {
        run: `ganache-cli -l ${Config.gasLimit} --account="0x0191ecbd1b150b8a3c27c27010ba51b45521689611e669109e034fd66ae69621,9999999999999999999999999999999999999999999" --account="0x00f360233e89c65970a41d4a85990ec6669526b2230e867c352130151453180d,9999999999999999999999999999999999999999999" --account="0x987a26abca7432016104ce2f24ce639340e25afe06ac69f68791399e7a5d1028,9999999999999999999999999999999999999999999" --account="0x89af34b1b7347834048b99423dad174a14bf14540d720d72c16ae92e94b987cb,9999999999999999999999999999999999999999999" --account="0xc867be647eb2bc51e4c0d61066859875cf3634fe949b6f5f85c69ab90e485b37,9999999999999999999999999999999999999999999" --account="0xefabcc2377dee5e51b5a9e65a3854aec85fbbec3cb584d8ad4f9679869fb33c6,9999999999999999999999999999999999999999999"`,
        runAsync: runInNewWindow("npm start test.ganache.run")
      },
      ganacheDb: {
        /**
         * ganacheDb scripts are handy for doing development against ganache, enabling you to
         * take a snapshot (the database of the chain at any point, such as right after migration,
         * and easily reuse it.
         *
         * Follow these steps to set up the database:
         *
         * This can take a long time as there may be thousands of files to delete:
         *
         *    npm start test.ganacheDb.clean
         *
         * The following will open a window with ganache running in it:
         *
         *    npm start test.ganacheDb.runAsync
         *
         * This will migrate the contracts and pull them into the project where they need to be:
         *
         *    npm start migrateContracts
         *
         * Now zip database for later reuse.
         * But first you must close the window in which ganache is running.
         * (You must do this yourself, in your OS.)
         *
         *    npm start test.ganacheDb.zip
         *
         * You can later unzip the database:
         *
         *    npm start test.ganacheDb.restoreFromZip
         *
         * Now you can restart ganache against the new database:
         *
         *    npm start test.ganacheDb.runAsync
         *
         * And run tests or your application:
         *
         *    npm start test
         */
        run: series(
          mkdirp(pathDaostackArcGanacheDb),
          `ganache-cli --db ${pathDaostackArcGanacheDb} -l ${Config.gasLimit} --networkId 1512051714758 --mnemonic "behave pipe turkey animal voyage dial relief menu blush match jeans general"`
        ),
        runAsync: runInNewWindow("npm start test.ganacheDb.run"),
        clean: rimraf(pathDaostackArcGanacheDb),
        zip: `node ./package-scripts/archiveGanacheDb.js ${pathDaostackArcGanacheDbZip} ${pathDaostackArcGanacheDb}`,
        unzip: series(
          "nps test.ganacheDb.clean",
          `node ./package-scripts/unArchiveGanacheDb.js  ${pathDaostackArcGanacheDbZip} ${pathArcJsRoot}`
        ),
        restoreFromZip: series(
          "nps test.ganacheDb.clean",
          "nps test.ganacheDb.unzip"
        )
      },
      build: {
        default: series(
          "nps test.build.clean",
          mkdirp(pathArcTestBuild),
          `node node_modules/typescript/bin/tsc --outDir ${pathArcTestBuild} --project ${pathArcTest}`
        ),
        clean: rimraf(joinPath(pathArcTestBuild, "*"))
      },
    },
    build: {
      default: series(
        "nps build.clean",
        mkdirp(joinPath(pathArcJsRoot, "dist")),
        `node node_modules/typescript/bin/tsc --outDir ${joinPath(pathArcJsRoot, "dist")}`

      ),
      clean: rimraf(joinPath(pathArcJsRoot, "dist"))
    },
    deploy: {
      pack: series("nps build", "npm pack"),
      publish: series("nps build", "npm publish")
    },
    /**
     * See README.md for how to use these scripts in a workflow to migrate contracts
     */
    migrateContracts: {
      /**
       * Migrate contracts.
       *
       * Truffle will merge this migration with whatever previous ones are already present in the contract json files.
       *
       * Run migrateContracts.fetchFromArc first if you want to start with fresh unmigrated contracts from @daostack/arc.
       */
      default: `${truffleCommand} migrate --contracts_build_directory ${pathArcJsContracts} --without-compile --network ${network}`,
      /**
       * Clean the outputted contract json files, optionally andMigrate.
       *
       * IMPORTANT! Only do this if you aren't worried about losing
       * previously-performed migrations to other networks.  By cleaning, you'll lose them, starting
       * from scratch.  Otherwise, truffle will merge your migrations into whatever  previous
       * ones exist.
       */
      clean: {
        default: rimraf(joinPath(pathArcJsContracts, "*")),
        /**
         * clean and fetch.
         * Run this ONLY when you want to start with fresh UNMIGRATED contracts from @daostack/arc.
         */
        andFetchFromArc: series(
          "nps migrateContracts.clean",
          "nps migrateContracts.fetchFromArc"
        ),
        /**
         * clean, fetch and migrate.
         * Run this ONLY when you want to start with fresh UNMIGRATED contracts from @daostack/arc.
         */
        andMigrate: series(
          "nps migrateContracts.clean.andFetchFromArc",
          "nps migrateContracts"
        )
      },
      /**
       * Fetch the unmigrated contract json files from DAOstack Arc.
       * Run this ONLY when you want to start with fresh UNMIGRATED contracts from DAOstack Arc.
       * Best to run "migrateContracts.clean" first.
       */
      fetchFromArc: copy(`${joinPath(pathDaostackArcRepo, "build", "contracts", "*")}  ${pathArcJsContracts}`)
    },
    "docs": "node ./package-scripts/docs/createMarkdown.js"
  }
};
