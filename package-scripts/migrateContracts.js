const DAOstackMigration = require('@daostack/migration');

const output = process.argv[2];

DAOstackMigration.migrateBase({
  output: output,
  force: true,
  privateKey: "0x8d4408014d165ec69d8cc9f091d8f4578ac5564f376f21887e98a6d33a6e3549"
});
