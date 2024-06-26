/**
 * University of La Laguna
 * High School of Engineering and Technology
 * Degree in Computer Science
 * Computación en la Nube
 *
 * @author Marcos Barrios
 * @since 07_04_2024
 * @desc Start script for the express server of the generic cloud computing
 *    service
 *
 */

'use strict';

const express = require('express');
const path = require('path');
const { fileURLToPath } = require('url');
const process = require('process');
const { readFile, writeFile } = require('fs/promises');
const fs = require('fs/promises');

const Queue = require('../src/queue.js');

const { config } = require('../src/config.js');

const cors = require('cors');

const __filename = __filename;
const __dirname = path.dirname(__filename)

/**
 * @summary Configure and run the webserver.
 */
function execute() {
  const application = express();

  application.set('port', 8080);

  const PATH_TO_SRC = path.join(__dirname, '../src');
  application.use(express.static(PATH_TO_ROOT));
  application.use(express.static(PATH_TO_SRC));
  application.use(express.json());
  application.use(cors());

  const queue = new Queue();

  application.listen(application.get('port'), '0.0.0.0', function() {
    const DEFAULT_START_MESSAGE =
        'The server is running on http://<your machine IP addr>:';
    console.log(DEFAULT_START_MESSAGE + application.get('port'));
  });
  
  application.post('/register', async (request, response) => {
    const info = request.body;

    // create the serviceFiles folder
    const PATH_TO_SERVICE_FILES = config.serviceFilesPath + info.id;
    await fs.mkdir(PATH_TO_SERVICE_FILES, { recursive: true });
    
    function next() {
      console.log('Next job execution started.');
      queue.next();
    }
    const job = new Job(info, next);
    queue.add(job); // dont execute because I need to download the files first.

    response.send('OK');
  });

}

if (process.argv[1] === __filename) {
  execute();
}
