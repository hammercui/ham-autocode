// core/state/migrate.js
'use strict';
const CURRENT_VERSION = 2;

const migrations = {
  // 1: (data) => { data.schemaVersion = 2; return data; }
};

function migrate(data) {
  if (!data || !data.schemaVersion) {
    data = data || {};
    data.schemaVersion = CURRENT_VERSION;
    return data;
  }
  let version = data.schemaVersion;
  while (version < CURRENT_VERSION) {
    if (migrations[version]) {
      data = migrations[version](data);
    }
    version++;
    data.schemaVersion = version;
  }
  return data;
}

module.exports = { migrate, CURRENT_VERSION };
