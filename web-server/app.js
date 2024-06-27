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
const { readdir, rm, mkdirSync } = require('fs');

const cors = require('cors');
const multer = require('multer');
const archiver = require('archiver');

const Queue = require('../src/queue.js');
const Job = require('../src/job.js');

const config = require('../src/config.js');

/**
 * @summary Configure and run the webserver.
 */
function execute() {
  const application = express();

  application.set('port', 8081);

  const PATH_TO_SRC = path.join(__dirname, '../src');
  application.use(express.static(PATH_TO_SRC));
  application.use(express.json());
  application.use(cors());

  const queue = new Queue();

  // setup file storage.
  const storage = multer.diskStorage({
    destination: (request, file, cb) => {
      const PATH = config.serviceFilesPath + request.headers['x-service-id'];
      mkdirSync(PATH, { recursive: true });
      cb(null, PATH);
    },
    filename: (request, file, cb) => {
      cb(null, file.originalname);
    }
  });
  const upload = multer({ storage: storage });

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

    // create the output subfolder
    const PATH_TO_SERVICE_FILES_OUTPUT = config.serviceFilesPath + info.id +
        '/output/';
    await fs.mkdir(PATH_TO_SERVICE_FILES_OUTPUT, { recursive: true });
    
    const job = new Job(info);
    queue.addToWaitingForFiles(job, info.id);

    response.send('OK');
  });

  application.post('/pushinputfiles', upload.array('files', 20),
      async (request, response) => {
        const id = request.headers['x-service-id'];
        queue.start(id);
        response.send(`File(s) uploaded successfully! Execution starts now.`);
      });

  application.post('/deletefiles', async (request, response) => {
    const info = request.body;
    rm(config.serviceFilesPath + info.id, { recursive: true }, (err) => {
        if (err) {
            console.error(`Error deleting folder: ${err}`);
            response.send('Could not delete  files on host.');
        } else {
            console.log(`Folder ${folderPath} is deleted successfully.`);
            response.send('Deleted both input files and output files from host.');
        }
    });
  });

  application.get('/availableoutputfiles', async (request, response) => {
    // read the output dir and check if non empty
    readdir(config.serviceFilesPath + request.body.id + '/output/', (error, files) => {
      if (error) {
        console.error('Cannot read output files. Error occurred while ' +
            'reading the folder:', error);
        response.json({
          filesAvailable: 'false',
          id: request.body.id
        });
      } else {
        response.json({
          filesAvailable: files.length > 0 ? 'true' : 'false',
          id: request.body.id
        });
      }
    });
  });

  application.get('/downloadoutput', async (request, response) => {
    const filesToZIP = [];

    // attach the output files
    readdir(config.serviceFilesPath + request.body.id + '/output/', (error, files) => {
      if (error) {
        console.error('Cannot read output files. Error occurred while ' +
            'reading the folder:', error);
        response.status(500).send('Failed to read output files path.');
      } else {
        files.forEach(file => {
          const FILE_PATH =
              config.serviceFilesPath + request.body.id + '/output/' + `${file}`;
          readFile(FILE_PATH, null, (err, data) => {
            if (err) {
              console.log('Could not read an output file of the service run: ' +
                  FILE_PATH);
              return;
            }
            filesToZIP.push({ name: file, path: FILE_PATH, })
          });
        });
      }
    });

    response.setHeader('Content-Disposition',
          `attachment; filename=job_${request.body.id}_output.zip`);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Set the compression level
    });
    archive.on('error', (err) => {
      console.error('failed to compress output files for service run' +
          request.body.id, err);
    });
    archive.pipe(response);
    filesToZIP.forEach(file => {
        archive.file(file.path, { name: file.name });
    });
    archive.finalize();
  });
}

if (process.argv[1] === __filename) {
  execute();
}
