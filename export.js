const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

const cassandraService = require('./cassandra-service');
const exportService = require('./export-service');
const util = require('./util');

let config = require('./config.js');

function messageHandler(table) {
  exportService.exportSingleTable(table)
  .then(function resolve() {
    console.log('success exporting table :', table);
    process.send('done');
  }, function error() {
    console.log('Error exporting table :', table);
  });
}

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  setInterval(() => {
    let nbAlives = util.alives(cluster);
    console.log('nbAlives=', nbAlives);
    if (nbAlives == 0) {
      process.exit();
    }
  }, 3000);

  cassandraService.listTables()
  .then(function (tables){
      tables.forEach( table => {
        if (util.shouldProcessTable(table)) {
          cluster.fork().send(table);
        }
      });
  });

  cluster.on('fork', () => {
    console.log('a worker has been forked');
  });

  cluster.on('setup', () => {
    console.log('cluster is setting up');
  });

  cluster.on('message', (worker, message, handle) => {
    console.log(`message: worker=${worker.process.pid} message=${message} handle=${handle} args=${arguments.length}`);
    if (message === 'done') {
      console.log('received done message');
      worker.disconnect();
    }
  });

  cluster.on('online', (worker) => {
    console.log(`Worker ${worker.process.pid} is online`);
  });

  cluster.on('death', function(worker) {
    console.log(`worker ${worker.process.pid} died`);
  });

  cluster.on('exit', (worker, code, signal) => {
    exportService.gracefulShutdown();
    cassandraService.gracefulShutdown();
    console.log('Closing connection of systemClient');
    console.log(`worker ${worker.process.pid} died`);
  });

} else {
  console.log(`Worker ${process.pid} started`);

  process.on('message', (table) => {
    console.log(`Worker ${process.pid} received table :`, table);
    messageHandler(table);
  });

  process.on("disconnect", function() {
    console.log("worker shutdown");
  });
}
