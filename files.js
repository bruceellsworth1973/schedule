const CONNECTION = () => ({address:'localhost', port:3001, cert:load(SSL+'servercert.crt'), key:load(SSL+'servercert.key')});
const MEGABYTE = 1024*1024*1024;
const MAXFILESIZE = 2*MEGABYTE;
const REPOSITORY = 'repository';
const SSL = '/var/www/ssl/';
const {createServer} = require('https');
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const {load, isArray} = require('helpers');
const {cert, key, port, address} = CONNECTION();
const {json, urlencoded, static} = express;
const app = express();
const uploadSettings = {
	preserveExtension:true,
	limits:{fileSize:MAXFILESIZE},
	abortOnLimit:true,
	safeFileNames:true,
	useTempFiles:true,
    tempFileDir:'tmp/'
};
// generate temporary names for files moved to the download repository
const uniqueName = () => {
	const d = new Date();
	const prefix = [
		d.getFullYear(),
		d.getMonth()+1,
		d.getDate(),
		d.getHours(),
		d.getMinutes(),
		d.getSeconds()
	];
	return prefix.join('')+'.pdf';
};
// handle upload requests
const captureUpload = async (req, res) => {
	const {files} = req;
	if (files)
	{
		const {payload} = files;
		if (payload)
		{
			try
			{
				const data = [];
				const files = isArray(payload) ? payload : [payload];
				// ignore original filename
				for (const {mimetype, size, mv} of files)
				{
					const filename = uniqueName();
					await mv(`${REPOSITORY}/${filename}`);
					data.push({filename, mimetype, filesize:size});
				}
				return res.send(data);
			}
			catch(e) {res.status(500).send(e);}
		}
	}
	else {res.send({status:false});}
};
const ready = () => console.info(`listening on port ${port}`);
app.use(fileUpload(uploadSettings));
app.use(cors());
app.use(json());
app.use(urlencoded({extended:true}));
// route upload requests to handler
app.post('/upload', captureUpload);
// start https server
createServer({cert, key}).listen(port, address, ready).on('request', app);
