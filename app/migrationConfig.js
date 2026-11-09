const path = require('node:path');

module.exports = {
  MIGRATIONS_DIR: path.join(__dirname, 'migrations'),
  MIGRATION_FILE: /^\d+_[a-z0-9_]+\.sql$/,
  MIGRATION_LOCK_KEY: 727001,
  downFileFor: (name) => name.replace(/\.sql$/, '.down.sql'),
};
