
'use strict';

const fs = require('fs');
const jsonStream = require('JSONStream');
const color = require('chalk');

const client = require('./cassandra-service').client;
const util = require('./util');
let config = require('./config');

if (!fs.existsSync(config.dataDir)){
    fs.mkdirSync(config.dataDir);
}

function createJsonFile (table) {
  let jsonFile = fs.createWriteStream(config.dataDir + '/' + table + '.json');
  jsonFile.on('error', function (err) {
      console.log(`error : ${color.red(err)}`);
      reject(err);
  });
  return jsonFile;
}

let exportSingleTable = function (table) {
      return new Promise(function(resolve, reject) {
          console.log(`exportSingleTable ${color.yellow(table)}`);

          let processed = 0;
          let startTime = Date.now();
          let maxSize = util.getMaxSize(table);

          let writeStream = jsonStream.stringify('[', ',', ']');
          writeStream.pipe(createJsonFile(table));

          client.stream('SELECT * FROM "' + table + '"', [], { prepare : true , fetchSize : 1000 })
          .on('readable', function () {
            let row;
            let self = this;
            while (row = this.read()) {
              if (processed < maxSize) {
                let rowObject = {};
                row.forEach(function(value, key){
                    rowObject[key] = value;
                });
                writeStream.write(rowObject);
                if (processed%100 == 0) {
                  util.metrics(table, startTime, processed);
                }
                processed++;
              } else {
                util.metrics(table, startTime, processed);
                throw `${color.red("MaxSize reached! please set a higher maxSize in ")} ${color.yellow("config.json")}`;
              }
            }
          })
          .on('end', function () {
            console.log(`Ending writes to : ${color.yellow(table + '.json')}`);
            util.metrics(table, startTime, processed);
            writeStream.end();
            resolve();
          })
          .on('error', function (err) {
            reject(err);
          });
      });
}

module.exports.exportSingleTable = exportSingleTable;
