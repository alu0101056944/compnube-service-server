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
const process = require('process');
const { readdir, rm, mkdir, access, readFile } = require('fs/promises');
const { mkdirSync } = require('fs');

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
  const PATH_TO_SERVICE_INPUT =
      path.join(__dirname, '../serviceFiles/');
  application.use(express.static(PATH_TO_SRC));
  application.use(express.static(PATH_TO_SERVICE_INPUT));
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
    await mkdir(PATH_TO_SERVICE_FILES, { recursive: true });

    // create the output subfolder
    const PATH_TO_SERVICE_FILES_OUTPUT = config.serviceFilesPath + info.id +
        '/output/';
    await mkdir(PATH_TO_SERVICE_FILES_OUTPUT, { recursive: true });
    
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
    const FOLDER_PATH = config.serviceFilesPath + info.id;

    console.log('/deletefiles called.');

    async function pathExists(path) {
      try {
        await access(path);
        return true;
      } catch (err) {
        if (err.code === 'ENOENT') {
          return false;
        }
        throw err;
      }
    }

    const PATH_EXISTS = await pathExists(FOLDER_PATH);
    if (PATH_EXISTS) {
      try {
          await rm(FOLDER_PATH, { recursive: true });
          console.log(`Folder ${FOLDER_PATH} has been deleted successfully.`);
          response.send('Deleted both input files and output files from host.');
      } catch (err) {
          console.error(`Error deleting folder: ${err}`);
          response.send('Could not delete files on host.');
      }
    }
  });
  
  application.get('/downloadoutput', async (request, response) => {
    console.log('/downloadoutput called.');
    
    // attach the output files
    const filesToZIP = [];
    const OUTPUT_PATH = config.serviceFilesPath +
        request.headers['x-service-id'];
    try {
      const allFile = await readdir(OUTPUT_PATH);
      for (const filename of allFile) {
        const FILE_PATH =
            config.serviceFilesPath +
              request.headers['x-service-id'] + '/' + filename;
        console.log(FILE_PATH);
        const FILE_CONTENT = await readFile(FILE_PATH);
        filesToZIP.push({ fileContent: FILE_CONTENT, name: filename });
      }
      response.attachment(`${request.headers['x-service-id']}.zip`);
    } catch (error) {
        console.error('Cannot read output files. Error occurred while ' +
            'reading the folder:', error);
        response.status(500).send('Failed to read output files path.');
    }

    const archive = archiver('zip', {
      zlib: { level: 9 } // Set the compression level
    });
    archive.on('error', (err) => {
      console.error('failed to compress output files for service run' +
          request.headers['x-service-id'], err);
      response.status(500).send('Failed to compress to zip the output files.');
    });
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.log('Warning: ' + err);
      } else {
        // throw error
        throw err;
      }
    });
    archive.on('end', function() {
      console.log('Data has been drained');
    });
    archive.on('close', function() {
      console.log(archive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
    });
    
    archive.pipe(response);
    filesToZIP.forEach(file => {
      archive.append(file.fileContent, { name: file.name });
    });
    await archive.finalize();
  });
}

if (process.argv[1] === __filename) {
  execute();
}
