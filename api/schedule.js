const CONNECTION = () => ({address:'localhost', port:3000, path:'/websocket', cert:load(SSL+'servercert.crt'), key:load(SSL+'servercert.key'), keepalive:20});
const LOGGING = false;
const DEBUGGING = true;
const VERBOSE = false;
const DRIVERS = 'drivers';
const SSL = '/var/www/ssl/';
const {Router} = require('securechannel');
const {stringify, load, bind, assign, apply, reduce, iterable, KEYS} = require('helpers');
const express = require('express');
const {json} = require('body-parser');
function errorLog(...messages)
{
	DEBUGGING && console.error(...messages);
}
function activityLog(...messages)
{
	LOGGING && console.log(...messages);
}
function verboseLog(...messages)
{
	VERBOSE && console.log(...messages);
}
class Application extends Router
{
	reply(response, result)
	{
		try
		{
			response.header('Content-Type', 'application/json');
			response.send(result);
		}
		catch(e) {errorLog(e);}
	}
	constructor(connection, devices, driverPath)
	{
		const exit = code => this.end(code);
		// build a list of ready signalers for all domains
		const isWaiting = [];
		const isReady = {};
		const wait = domain => isWaiting.push(new Promise(ready => {isReady[domain] = ready;}));
		iterable(devices, KEYS).forEach(wait);
		// process event handlers
		const exceptions = {
			'SIGINT':exit,
			'SIGTERM':exit,
			'unhandledRejection':console.error
		};
		// client event handlers
		const events = {
			heartbeat({sessionid, latency}) {verboseLog({[sessionid]:{latency}});},
			sessions({sessions}) {verboseLog({sessions});},
			listening({address, port}) {activityLog(`${address}:${port}`, 'server listening');},
			close({address, reason}) {activityLog(address, 'connection closed:', reason);},
			async open({address})
			{
				activityLog(address, 'connection opened');
				await application.ready();
				activityLog('sending ready');
				this.message('ready', {});
				await Promise.all(isWaiting);
			},
		};
		// core program logic to handle events from central message router
		const sources = {
			request:{},
			nodes:
			{
				async ready({domain, node, flag})
				{
					if (flag)
					{
						const command = 'getCommands';
						const exposeMethods = (actions, type) => ({...actions, [type]:values => schedule.query({[domain]:{[type]:{node, ...values}}})});
						const maskCommand = method => method !== command;
						const methods = await schedule.query({[domain]:{[command]:{node}}});
						const actions = apply(reduce(exposeMethods), methods.filter(maskCommand), {});
						// expose downstream worker methods to channel server
						assign(actions).to(sources.request);
						// signal ready for this domain
						isReady[domain]();
					}
				}
			},
			mysql:
			{
				status({node, data})
				{
					for (const {table_name, last_updated} of data)
					{
						const prev = application.cache(['mysql', 'status', node, table_name]);
						if (prev !== last_updated)
						{
							application.cache(['mysql', 'status', node, table_name], last_updated, true);
							schedule.data('status', {[node]:table_name});
						}
					}
				}
			}
		};
		const sinks = {
			nodes:
			{
				ready({domain, node, flag}) {schedule.data('nodes', {domain, node, flag});}
			}
		};
		const state = {};
		// register Express API methods
		const api = express().set('title', 'Schedule').use(json())
			.get('/v1/status', (_, response) => this.reply(response, stringify(state)))
			.get('/v1/restart', (_, response) => this.reply(response, 'restarting in 1 second') || setTimeout(exit, 1000));
		// create message router
		const application = super({channels:{schedule:{sources, sinks, events, connection, devices}}, state}, driverPath).bind({schedule:api});
		// acquire channel handle
		const {schedule} = application.servers;
		// bind process events
		bind(exceptions).to(process);
	}
}
// start application
Router.getDevices(DRIVERS).then(devices => new Application(CONNECTION(), devices, DRIVERS));
