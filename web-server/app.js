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
const { readdir, rm, mkdir, access, readFile, rename,
    copyFile, unlink  } = require('fs/promises');
const { constants } = require('fs');

const cors = require('cors');
const multer = require('multer');
const archiver = require('archiver');

const unzipper = require('unzipper');

const Queue = require('../src/queue.js');
const Job = require('../src/job.js');

const config = require('../src/config.js');

/**
 * @summary Configure and run the webserver.
 */
async function execute() {
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
  const idToJob = {};

  // setup file storage.
  const storage = multer.diskStorage({
    destination: (request, file, cb) => {
      const ID = request.headers['x-service-id'];
      const PATH = config.serviceFilesPath + ID;
      cb(null, PATH);
    },
    filename: (request, file, cb) => {
      cb(null, file.originalname);
    }
  });
  const upload = multer({ storage: storage });

    // setup stream file storage.
  const storage2 = multer.diskStorage({
    destination: (request, file, cb) => {
      const ID = request.headers['x-service-id'];
      const STREAM_DESTINATION = path.resolve(`${config.serviceFilesPath}${ID}`,
        request.headers['stream-destination']);
      console.log('Stream destination: ' + STREAM_DESTINATION);
      cb(null, STREAM_DESTINATION);
    },
    filename: (request, file, cb) => {
      cb(null, file.originalname);
    }
  });
  const upload2 = multer({ storage: storage2 });

  application.listen(application.get('port'), '0.0.0.0', function() {
    const DEFAULT_START_MESSAGE =
        'The server is running on http://<your machine IP addr>:';
    console.log(DEFAULT_START_MESSAGE + application.get('port'));
  });
  
  application.post('/register', async (request, response) => {
    const info = request.body;

    // create the serviceFiles folder
    const ID = info.id;
    const PATH = config.serviceFilesPath + ID;

    try {
      console.log('Readying up ' + PATH + ' path for ' + ID + '.');
      await mkdir(PATH, { recursive: true });

      // Delete all existing files in the directory if it existed already
      const files = await readdir(PATH, { withFileTypes: true });
      console.log('Could sucessfully read ' + ID + '\'s directory.');
      for (const file of files) {
        const FULL_PATH = path.join(PATH, entry.name);
        if (file.isDirectory()) {
          await fs.rmdir(FULL_PATH, { recursive: true });
          console.log('Deleted directory: ' + FULL_PATH +
            ' as part of the readying up process for ' + ID + '.');
        } else {
          await fs.unlink(FULL_PATH);
          console.log('Deleted file: ' + FULL_PATH +
            ' as part of the readying up process for ' + ID + '.');
        }
      }
    } catch (error) {
      console.error('Could not ready up the directory for ' + ID + '. ' +
        'Error: ' + error);
    }

    const job = new Job(info);
    idToJob[info.id] = job;
    queue.addToWaitingForFiles(job, info.id);

    response.send('OK');
  });

  application.post('/pushinputfiles',
      upload.array('files', 20),
      async (request, response, next) => {
        const files = request.files;
        const ID = request.headers['x-service-id'];
        const PATH = path.join(config.serviceFilesPath, ID);
        try {
          console.log('Waiting for files to be available for ' + ID);

          // Wait for all files to be accessible
          await Promise.all(files.map(file => 
            access(path.join(PATH, file.filename), constants.F_OK)
          ));
          console.log('File transfers for ' + ID + ' finished.')
        } catch (error) {
          console.error('Error ensuring all files are saved for ' + ID + ':',
              error);
          console.log('Abort job ' + ID + '.');
          await idToJob[ID].abort();
          response.status(500).send('Error processing files for ' + ID +
              '. Aborted job.');
        }

        // unzip the input zip file if applicable
        const ZIP_NAME = request.headers['zip-name'];
        const ZIP_PATH = `serviceFiles/${ID}/${ZIP_NAME}`;
        try {
          const directory = await unzipper.Open.file(ZIP_PATH);
          if (request.headers['has-zip']) {
            await directory.extract({ path: PATH });
          }
          next();
        } catch (error) {
          console.error('Error when trying to unzip the associated zip of ' +
            ID + '. Execution will not start. Error: ' + error);
          return;
        }
      },
      async (request, response) => {
        const id = request.headers['x-service-id'];
        response.send('File(s) uploaded successfully for ' + id +
            '! Execution starts now.');
        queue.start(id);
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

  application.post('/terminaterun', async (request, response) => {
    const ID = request.body.id;
    const job = idToJob[ID];
    console.log('Kill request for ' + ID + ' applied.');
    try {
      job.kill();
    } catch (error) {
      console.error(error);
    }
  });

  application.post('/alivestatecheck', async (request, response) => {
    const allIdPotentiallyDead = request.body.ids;
    const allActuallyDeadId = [];
    for (const idPotentiallyDead of allIdPotentiallyDead) {
      if (!idToJob[idPotentiallyDead]) {
        allActuallyDeadId.push(idPotentiallyDead);
      }
    }
    response.json({ allDeadId: allActuallyDeadId });
  });

  application.post('/pushstreaminputfiles',
    upload2.array('files', 20),
    async (request, response) => {
      const id = request.headers['x-service-id'];
      response.send('File(s) uploaded successfully for ' + id +
          '! Execution starts now.');
    });
}

if (process.argv[1] === __filename) {
  execute();
}
