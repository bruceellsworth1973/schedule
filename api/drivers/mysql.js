const CONNECTION = () => ({host:'localhost', port:3306, user:process.env.USER, password:'zihuwuh4', database:'schedule', multipleStatements:true});
const DEVICES = {"localhost":{}};
const DEBUGGING = false;
const REFRESHINTERVAL = 5;
const REPOSITORY = '../../repository/';
const {isEqual, isEmpty, isArray, assign, bind, includes, identity, parse, resolve, reject, toSeconds, toHMS, sum, arrayColumn, arrayDifference, mv, iterable, KEYS} = require('helpers');
const {createConnection:mysql} = require('mysql');
const {IPC} = require('securechannel');
const NOW = `CONVERT_TZ(NOW(), @@global.time_zone, '+00:00')`;
const errorLog = (...messages) => DEBUGGING && console.error(...messages);
class Mysql extends IPC
{
	prepare(sql, values)
	{
		const mysql = this.socket;
		return mysql.format(sql, values);
	}
	query(sql, values)
	{
		// performs general queries
		values = values || [];
		const mysql = this.socket;
		const typeCast = ({type, string}, next) => isEqual(type, 'JSON') ? parse(string()) : next();
		return new Promise((resolve, reject) => mysql.query({sql, typeCast, values}, (err, rows) => err ? reject(err) : resolve(rows)));
    }
	refresh()
	{
		// this method is polled periodically to keep things in sync automatically,
		// but it should also be called on demand when data updates are committed
		// to provide more timely notifications to clients
		const cleanup = () => this.removeStaleSessions();
		const getStatus = () => this.query('SELECT * FROM status');
		const emit = status => this.emit('status', status);
		// log errors but prevent exceptions from bubbling
		return cleanup().then(getStatus).then(emit).catch(errorLog);
	}
	updateStatus(table_name, sendRefresh = true)
	{
		// stores the timestamp of the most recent update of each tracked table
		const table = 'status';
		const sql = this.prepare(`INSERT INTO ?? (table_name, last_updated) VALUES (?, ${NOW}) ON DUPLICATE KEY UPDATE last_updated = ${NOW}`, [table, table_name]);
		const commit = () => this.query(sql);
		const refresh = () => sendRefresh && this.refresh();
		return commit().then(refresh);
	}
	updateLogin(user_id)
	{
		// stores the timestamp of the most recent login for each user
		const table = 'users';
		const sql = this.prepare(`UPDATE ?? SET last_login = ${NOW} WHERE ?`, [table, {user_id}]);
		const commit = () => this.query(sql);
		return commit();
	}
	updateAccessed(session_id)
	{
		// stores the timestamp of the most recent access for each user
		const table = 'sessions';
		const sql = this.prepare(`UPDATE ?? SET last_access = ${NOW} WHERE ?`, [table, {session_id}]);
		return this.query(sql);
	}
	async getUserPermissions(session_id)
	{
		const access = {};
		const sql = this.prepare('SELECT DISTINCT permission_id, IFNULL(committee_id, 0) AS committee_id FROM group_access NATURAL JOIN group_membership g NATURAL JOIN users NATURAL JOIN sessions WHERE session_id = ?', [session_id]);
		const rows = await this.query(sql);
		const addSubscript = (x, y) => isArray(access[x]) ? access[x].push(y) : access[x] = [y];
		rows.forEach(({committee_id, permission_id}) => addSubscript(committee_id, permission_id));
		return access;
	}
	async recallSession(sessionid, userActivity = false)
	{
		try
		{
			const sql = 'SELECT u.user_id AS userid, u.login_name AS login, u.first_name AS firstname, u.last_name AS lastname, true AS loggedin FROM sessions s JOIN users u WHERE u.user_id = s.user_id AND s.? AND u.?';
			const rows = await this.query(sql, [{session_id:sessionid}, {enabled:true}]);
			if (1 < rows.length) {throw('multiple session records returned');}
			if (1 === rows.length)
			{
				const [{userid, login, firstname, lastname, loggedin}] = rows;
				const access = await this.getUserPermissions(sessionid);
				// restarts the automatic logout countdown
				userActivity && this.updateAccessed(sessionid);
				return {sessionid, userid, login, firstname, lastname, loggedin, access};
			}
		}
		catch(e) {errorLog(e);}
		// session is not logged in or has timed out, or an error occurred
		return {sessionid, userid:0, login:'', firstname:'', lastname:'', loggedin:false, access:{}};
	}
	async authorizeAccess(sessionid, test)
	{
		const {userid, access, loggedin} = await this.recallSession(sessionid);
		if (loggedin)
		{
			for (const [committee, permissions] of iterable(access))
			{
				if (test(committee, permissions))
				{
					// record access timestamp for session
					await this.updateAccessed(sessionid);
					// return success
					return userid;
				}
			}
			throw('unauthorized access');
		}
		throw('session expired');
	}
	order(columns)
	{
		const operators = ['ASC', 'DESC'];
		const toString = ([column, order]) => includes(order).in(operators) ? `${this.prepare('??', [column])} ${order}` : null;
		const order = iterable(columns).map(toString).filter(Boolean);
		return order.length > 0 ? ' ORDER BY ' + order.join(', ') : '';
	}
	where(criteria, delimiter = ' AND ')
	{
		const operators = ['=', '!=', '<', '>', '<=', '>=', 'LIKE'];
		const toString = ([column, {operator, val}]) => {
			if (includes(operator).in(operators))
			{
				// do case-insensitive text search
				if (operator === 'LIKE') {return this.prepare('UPPER(??) LIKE ?', [column, (''+val).toUpperCase()]);}
				else {return this.prepare(`?? ${operator} ?`, [column, val]);}
			}
			return null;
		};
		const where = iterable(criteria).map(toString).filter(Boolean);
		return where.length > 0 ? ' WHERE ' + where.join(delimiter) : '';
	}
	async getActivity(sessionid, values, criteria = {})
	{
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		const where = this.where(criteria);
		const order = this.order(values);
		const table = 'activity_history';
		const sql = this.prepare(`SELECT * FROM ??${where}${order}`, [table]);
		return await this.query(sql);
	}
	logActivity(user_id, table_name, event_type, sendRefresh = true)
	{
		// keeps a rolling history of changes to each tracked table
		const sql = this.prepare(`INSERT INTO activity_history (user_id, table_name, event_type, event_timestamp) VALUES (?, ?, ?, ${NOW})`, [user_id, table_name, event_type]);
		const commit = () => this.query(sql);
		const updateStatus = () => {
			this.updateStatus(table_name, sendRefresh);
			this.updateStatus('activity_history', true);
		};
		return commit().then(updateStatus);
	}
	async authenticateUser(login_name, password_hash, session_id)
	{
		// logs the user in after verifying credentials
		const table = 'users';
		const sql = this.prepare('SELECT user_id FROM ?? WHERE ? AND ? AND ?', [table, {login_name}, {password_hash}, {enabled:true}]);
		const rows = await this.query(sql);
		if (1 < rows.length) {throw('multiple session records returned');}
		if (0 === rows.length)
		{
			const message = 'login attempt failed: ' + login_name;
			this.logActivity(null, table, message);
			throw(message);
		}
		const [{user_id}] = rows;
		await this.updateLogin(user_id);
		await this.updateSession(session_id, user_id);
		return await this.recallSession(session_id, true);
	}
	updateSession(session_id, user_id)
	{
		// logs the user in and creates a saved session
		const table = 'sessions';
		const sql = this.prepare(`INSERT INTO ?? (session_id, user_id, last_access) VALUES (?, ?, ${NOW}) ON DUPLICATE KEY UPDATE last_access = ${NOW}`, [table, session_id, user_id]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(user_id, table, 'user logged in');
		return commit().then(refresh);
	}
	getActiveSessions()
	{
		const sql = `SELECT session_id, user_id FROM sessions NATURAL JOIN users`;
		return this.query(sql);
	}
	async removeStaleSessions(expireMinutes = 30)
	{
		// provides a mechanism to automatically log out inactive users
		const index = (column, arr) => arr.reduce((obj, row) => ({...obj, [row[column]]:row}), {});
		const oldSessions = index('session_id', await this.getActiveSessions());
		const table = 'sessions';
		const sql = this.prepare(`DELETE FROM ?? WHERE last_access < DATE_SUB(${NOW}, INTERVAL ? MINUTE)`, [table, expireMinutes]);
		const commit = () => this.query(sql);
		const refresh = async ({affectedRows}) => {
			if (affectedRows)
			{
				const currentSessions = arrayColumn(await this.getActiveSessions(), 'session_id');
				const deleted = arrayDifference(iterable(oldSessions, KEYS), iterable(currentSessions, KEYS));
				deleted.map(sessionid => this.logActivity(oldSessions[sessionid].user_id, table, 'logged out due to inactivity'));
			}
		};
		return await commit().then(refresh);
	}
	async endSession(session_id)
	{
		// logs the user out
		const table = 'sessions';
		const sql = this.prepare('DELETE FROM ?? WHERE ?', [table, {session_id}]);
		const {userid} = await this.recallSession(session_id);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => (affectedRows) && this.logActivity(userid, table, 'user logged out', false);
		const recallSession = () => this.recallSession(session_id, true);
		return await commit().then(refresh).then(recallSession);
	}
	async getLegislativeSessions(sessionid)
	{
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		const sql = 'SELECT DISTINCT sess_number FROM meetings';
		const rows = await this.query(sql);
		return rows.map(({sess_number}) => ({[sess_number]:sess_number}));
	}
	async getSettings(sessionid, criteria = {setting_id:{val:0}})
	{
		const {setting_id} = criteria;
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		if (setting_id.val === 0) {delete criteria.setting_id}
		const where = this.where(criteria);
		const table = 'settings';
		const sql = this.prepare(`SELECT * FROM ??${where}`, [table]);
		return await this.query(sql);
	}
	async deleteSetting(sessionid, values = {})
	{
		const {setting_id} = values;
		const test = (committee, permissions) => {
			committee = +committee;
			return Boolean(committee === 0 && permissions.includes('deleteSetting'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'user_groups';
		const sql = this.prepare(`DELETE FROM ?? WHERE ?`, [table, {setting_id}]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `delete setting ${setting_id}`);
		return await commit().then(refresh);
	}
	async updateSetting(sessionid, values = {}, criteria = {})
	{
		const settings = await this.getCommittees(sessionid, criteria);
		if (settings.length === 0) {throw 'no settings match query'}
		if (settings.length > 1) {throw 'attempt to modify multiple settings canceled'}
		const [{setting_id}] = settings;
		const test = (committee, permissions) => {
			committee = +committee;
			return Boolean(committee === 0 && permissions.includes('modifySetting'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'users';
		const sql = this.prepare(`UPDATE ?? SET ? WHERE ?`, [table, values, {setting_id}]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `update setting ${setting_id}`);
		return await commit().then(refresh);
	}
	async newSetting(sessionid, values = {})
	{
		const test = (committee, permissions) => {
			committee = +committee;
			return Boolean(committee === 0 && permissions.includes('addSetting'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'settings';
		const sql = this.prepare(`INSERT INTO ?? SET ?`, [table, values]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows, insertId}) => affectedRows && this.logActivity(userid, table, `add new setting ${insertId}`);
		return await commit().then(refresh);
	}
	async getCommittees(sessionid, criteria = {committee_id:{val:0}})
	{
		const {committee_id} = criteria;
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		if (committee_id.val === 0) {delete criteria.committee_id}
		const where = this.where(criteria);
		const table = 'committees';
		const orderby1 = 'committee_chamber';
		const orderby2 = 'committee_name';
		const sql = this.prepare(`SELECT * FROM ??${where} ORDER BY ?? DESC, ??`, [table, orderby1, orderby2]);
		return await this.query(sql);
	}
	async deleteCommittee(sessionid, {committee_id})
	{
		const test = (committee, permissions) => {
			committee = +committee;
			return Boolean(committee === 0 && permissions.includes('deleteCommittee'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'committees';
		const sql = this.prepare(`DELETE FROM ?? WHERE ?`, [table, {committee_id}]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `delete committee ${committee_id}`);
		return await commit().then(refresh);
	}
	async updateCommittee(sessionid, values = {}, criteria = {})
	{
		const committees = await this.getCommittees(sessionid, criteria);
		if (committees.length === 0) {throw 'no committees match query'}
		if (committees.length > 1) {throw 'attempt to modify multiple committees canceled'}
		const [{committee_id}] = committees;
		const test = (committee, permissions) => {
			committee = +committee;
			return Boolean(committee === 0 && permissions.includes('modifyCommittee'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'users';
		const sql = this.prepare(`UPDATE ?? SET ? WHERE ?`, [table, values, {committee_id}]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `update committee ${committee_id}`);
		return await commit().then(refresh);
	}
	async newCommittee(sessionid, values = {})
	{
		const test = (committee, permissions) => {
			committee = +committee;
			return Boolean(committee === 0 && permissions.includes('addCommittee'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'committees';
		const sql = this.prepare(`INSERT INTO ?? SET ?`, [table, values]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows, insertId}) => affectedRows && this.logActivity(userid, table, `add new committee ${insertId}`);
		return await commit().then(refresh);
	}
	async getUsers(sessionid, criteria = {})
	{
		const {user_id} = criteria;
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		const where = user_id ? ` WHERE u.?` : '';
		const admin = "SELECT user_id, true AS system_admin FROM users NATURAL JOIN group_membership WHERE group_id = 1";
		const group = "SELECT user_id, group_id AS user_group FROM users NATURAL JOIN group_membership WHERE group_id > 2";
		const senate = "SELECT user_id, committee_id AS senate_committee FROM users NATURAL JOIN group_membership NATURAL JOIN committees WHERE group_id = 2 AND committee_chamber = 'S'";
		const house = "SELECT user_id, committee_id AS house_committee FROM users NATURAL JOIN group_membership NATURAL JOIN committees WHERE group_id = 2 AND committee_chamber = 'H'";
		const sql = `WITH admin AS (${admin}), senate AS (${senate}), house AS (${house}), usergroup AS (${group}) SELECT u.user_id, u.login_name, u.first_name, u.last_name, u.enabled, system_admin, senate_committee, house_committee, user_group FROM users u LEFT JOIN admin a ON a.user_id = u.user_id LEFT JOIN senate s ON s.user_id = u.user_id LEFT JOIN house h ON h.user_id = u.user_id LEFT JOIN usergroup g ON g.user_id = u.user_id${where}`;
		return await this.query(sql, [{user_id}]);
	}
	async deleteUser(sessionid, {user_id})
	{
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('deleteUser'));
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'users';
		const sql = this.prepare(`DELETE FROM ?? WHERE ?`, [table, {user_id}]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `delete user ${user_id}`);
		return await commit().then(refresh);
	}
	async deleteGroupMembership(criteria)
	{
		const table = 'group_membership';
		const sql = 'DELETE FROM ?? WHERE ?';
		return await this.query(sql, [table, criteria]);
	}
	async updateGroupMembership(groups, criteria)
	{
		await this.deleteGroupMembership(criteria);
		const table = 'group_membership';
		const sql = 'INSERT INTO ?? SET ?';
		let changed = false;
		const refresh = ({affectedRows}) => affectedRows && (changed = true);
		for (const values of groups) {await this.query(sql, [table, values]).then(refresh);}
		return changed && await this.updateStatus(table);
	}
	async updateUser(sessionid, values = {}, criteria = {})
	{
		const users = await this.getUsers(sessionid, criteria);
		if (users.length === 0) {throw 'no users match query'}
		if (users.length > 1) {throw 'attempt to modify multiple users canceled'}
		const [{user_id}] = users;
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('modifyUser'));
		const userid = await this.authorizeAccess(sessionid, test);
		const discreteObjects = (groups, [key, val]) => {
			if (key === 'system_admin') {return [...groups, {user_id, group_id:1}];}
			if (key === 'user_group') {return [...groups, {user_id, group_id:val}];}
			return [...groups, {user_id, group_id:2, committee_id:val}];
		};
		const valueExists = ([_, val]) => val; //eslint-disable-line
		const {senate_committee, house_committee, user_group, system_admin} = values;
		const capturedValues = {senate_committee, house_committee, user_group, system_admin};
		delete values.senate_committee;
		delete values.house_committee;
		delete values.user_group;
		delete values.system_admin;
		const table = 'users';
		const sql = this.prepare('UPDATE ?? SET ? WHERE ?', [table, values, {user_id}]);
		const commit = () => this.query(sql);
		const refresh = async ({affectedRows}) => {
			if (affectedRows)
			{
				const groups = iterable(capturedValues).filter(valueExists).reduce(discreteObjects, []);
				await this.updateGroupMembership(groups, {user_id});
				await this.logActivity(userid, table, `update user ${user_id}`);
			}
		};
		return await commit().then(refresh);
	}
	async updatePassword(sessionid, {password_hash})
	{
		const test = () => true;
		const user_id = await this.authorizeAccess(sessionid, test);
		const table = 'users';
		const sql = 'UPDATE ?? SET ? WHERE ?';
		const commit = () => this.query(sql, [table, {password_hash}, {user_id}]);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(user_id, table, `updated password`);
		return await commit().then(refresh);
	}
	async newUser(sessionid, values = {})
	{
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('addUser'));
		const userid = await this.authorizeAccess(sessionid, test);
		const valueExists = ([_, val]) => val; //eslint-disable-line
		const {senate_committee, house_committee, user_group, system_admin} = values;
		const capturedValues = {senate_committee, house_committee, user_group, system_admin};
		delete values.senate_committee;
		delete values.house_committee;
		delete values.user_group;
		delete values.system_admin;
		const table = 'users';
		const sql = this.prepare(`INSERT INTO ?? SET ?`, [table, values]);
		const commit = () => this.query(sql);
		const refresh = async ({affectedRows, insertId}) => {
			const user_id = insertId;
			const discreteObjects = (groups, [key, val]) => {
				if (key === 'system_admin') {return [...groups, {user_id, group_id:1}];}
				if (key === 'user_group') {return [...groups, {user_id, group_id:val}];}
				return [...groups, {user_id, group_id:2, committee_id:val}];
			};
			if (affectedRows)
			{
				const groups = iterable(capturedValues).filter(valueExists).reduce(discreteObjects, []);
				await this.updateGroupMembership(groups, {user_id});
				await this.logActivity(userid, table, `add new user ${user_id}`);
			}
		};
		return await commit().then(refresh);
	}
	async getPermissions(criteria = {})
	{
		const column = 'permission_id';
		const table = 'group_access';
		const where = this.where(criteria);
		const sql = `SELECT ?? FROM ??${where}`;
		const rows = await this.query(sql, [column, table]);
		return arrayColumn(rows, 'permission_id');
	}
	async getGroups(sessionid, criteria = {group_id:{val:0}})
	{
		const {group_id} = criteria;
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		if (group_id.val === 0) {delete criteria.group_id}
		const where = this.where(criteria);
		const table = 'user_groups';
		const orderby = 'group_id';
		const sql = this.prepare(`SELECT * FROM ??${where} ORDER BY ??`, [table, orderby]);
		const rows = await this.query(sql);
		for (const row of rows) {row.group_permissions = await this.getPermissions({group_id:{operator:'=', val:row.group_id}});}
		return rows;
	}
	async deleteGroup(sessionid, {group_id})
	{
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('deleteGroup'));
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'user_groups';
		const sql = this.prepare('DELETE FROM ?? WHERE ?', [table, {group_id}]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `delete group ${group_id}`);
		return await commit().then(refresh);
	}
	async deletePermissions({group_id})
	{
		const table = 'group_access';
		const sql = this.prepare('DELETE FROM ?? WHERE ?', [table, {group_id}]);
		return await this.query(sql);
	}
	async updatePermissions(values, {group_id})
	{
		await this.deletePermissions({group_id});
		const columns = ['group_id', 'permission_id'];
		const table = 'group_access';
		const sql = this.prepare('INSERT INTO ?? (??) VALUES ?', [table, columns, values]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.updateStatus(table);
		return await commit().then(refresh);
	}
	async updateGroup(sessionid, values = {}, criteria = {})
	{
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('modifyGroup'));
		const userid = await this.authorizeAccess(sessionid, test);
		const groups = await this.getGroups(sessionid, criteria);
		if (groups.length === 0) {throw 'no groups match query';}
		if (groups.length > 1) {throw 'attempt to modify multiple groups canceled';}
		const table = 'user_groups';
		const [{group_id}] = groups;
		const {group_permissions} = values;
		if (group_permissions) {delete values.group_permissions;}
		const sql = this.prepare('UPDATE ?? SET ? WHERE ?', [table, values, {group_id}]);
		const commit = () => this.query(sql);
		const updatePermissions = () => this.updatePermissions(group_permissions.map(v => [group_id, v]), {group_id});
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `update group ${group_id}`);
		if (!isEmpty(values)) {return await updatePermissions().then(commit).then(refresh);}
		else {return await updatePermissions().then(refresh);}
	}
	async newGroup(sessionid, values = {})
	{
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('addGroup'));
		const userid = await this.authorizeAccess(sessionid, test);
		let group_id;
		const table = 'user_groups';
		const {group_permissions} = values;
		if (group_permissions) {delete values.group_permissions;}
		const sql = this.prepare('INSERT INTO ?? SET ?', [table, values]);
		const commit = () => this.query(sql);
		const updatePermissions = () => this.updatePermissions(group_permissions.map(v => [group_id, v]), {group_id});
		const refresh = ({affectedRows, insertId}) => affectedRows && this.logActivity(userid, table, `add new group ${group_id = insertId}`);
		return await commit().then(refresh).then(updatePermissions);
	}
	async getAttachments(sessionid)
	{
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		const table = 'attachments';
		const sql = this.prepare(`SELECT * FROM ??`, [table]);
		return await this.query(sql);
	}
	async moveAttachment(sessionid, oldName, newName)
	{
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		const table = 'attachments';
		const sql = this.prepare('UPDATE ?? SET ? WHERE ?', [table, {filename:newName}, {filename:oldName}]);
		const rename = () => mv(REPOSITORY+oldName, REPOSITORY+newName);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows}) => affectedRows && this.updateStatus(table, true);
		return await rename().then(commit).then(refresh);
	}
	async newAttachment(sessionid, values = {})
	{
		const test = () => true;
		const userid = await this.authorizeAccess(sessionid, test);
		let file_id = 0;
		const table = 'attachments';
		const sql = this.prepare('INSERT INTO ?? SET ?', [table, values]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows, insertId}) => affectedRows && this.logActivity(userid, table, `add new attachment ${file_id = insertId}`);
		const response = () => file_id;
		return await commit().then(refresh).then(response);
	}
	async getMeetings(sessionid, criteria = {committee_id:{val:0}})
	{
		const {committee_id} = criteria;
		const test = (committee, permissions) => {
			committee = +committee;
			if (committee === 0 && permissions.includes('browseAllMeetings')) {return true;}
			return Boolean(committee_id && committee === committee_id.val && permissions.includes('browseMeetings'));
		};
		await this.authorizeAccess(sessionid, test);
		if (committee_id && committee_id.val === 0 || !committee_id) {delete criteria.committee_id;}
		const where = this.where(criteria);
		const table = 'meetings';
		const orderby = 'meetingtime';
		const sql = `SELECT * FROM ??${where} ORDER BY ?? DESC`;
		const rows = await this.query(sql, [table, orderby]);
		for (const row of rows)
		{
			const {video_duration} = row;
			row.total_duration = !isEmpty(video_duration) ? toHMS(video_duration.split(';').map(toSeconds).reduce(sum)) : null;
		}
		return rows;
	}
	async removeMeeting(sessionid, values = {})
	{
		const {meeting_id, committee_id} = values;
		const test = (committee, permissions) => {
			committee = +committee;
			if (committee === 0 && permissions.includes('removeAnyMeeting')) {return true;}
			return Boolean(committee_id && committee === committee_id && permissions.includes('removeMeeting'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'meetings';
		const sql = `DELETE FROM ?? WHERE ?`;
		const commit = () => this.query(sql, [table, {meeting_id}]);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `delete meeting ${meeting_id}`);
		return await commit().then(refresh);
	}
	async updateMeeting(sessionid, values = {}, criteria)
	{
		const meetings = await this.getMeetings(sessionid, criteria);
		if (meetings.length === 0) {throw 'no meetings match query';}
		if (meetings.length > 1) {throw 'attempt to modify multiple meetings canceled';}
		const [{meeting_id, committee_id}] = meetings;
		const test = (committee, permissions) => {
			committee = +committee;
			if (committee === 0 && permissions.includes('modifyAnyMeeting')) {return true;}
			return Boolean(committee_id && committee === committee_id && permissions.includes('modifyMeeting'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'meetings';
		const sql = `UPDATE ?? SET ? WHERE ?`;
		if (includes('publishtime').in(values)) {values.publishtime = new Date(values.publishtime);}
		values.meetingtime = new Date(values.meetingtime);
		delete values.total_duration;
		const commit = () => this.query(sql, [table, values, {meeting_id}]);
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(userid, table, `update meeting ${meeting_id}`);
		return await commit().then(refresh);
	}
	async newMeeting(sessionid, values = {})
	{
		const {committee_id} = values;
		const test = (committee, permissions) => {
			committee = +committee;
			if (committee === 0 && permissions.includes('addAnyMeeting')) {return true;}
			return Boolean(committee_id && committee === committee_id && permissions.includes('addMeeting'));
		};
		const userid = await this.authorizeAccess(sessionid, test);
		values.publishtime = new Date(values.publishtime);
		values.meetingtime = new Date(values.meetingtime);
		delete values.total_duration;
		const table = 'meetings';
		const sql = this.prepare(`INSERT INTO ?? SET ?`, [table, values]);
		const commit = () => this.query(sql);
		const refresh = ({affectedRows, insertId}) => affectedRows && this.logActivity(userid, table, `add new meeting ${insertId}`);
		return await commit().then(refresh);
	}
	getReportColumns({report_id})
	{
		const table = 'report_columns';
		const sql = this.prepare(`SELECT criterion FROM ?? WHERE ? ORDER BY priority ASC`, [table, {report_id}]);
		return this.query(sql);
	}
	getFilterBy({report_id})
	{
		const table = 'report_filters';
		const sql = this.prepare(`SELECT conjunction, criterion, column_name AS 'column', operator, value AS 'condition' FROM ?? WHERE ? ORDER BY priority ASC`, [table, {report_id}]);
		return this.query(sql);
	}
	getSortBy({report_id})
	{
		const table = 'report_sorts';
		const sql = this.prepare(`SELECT criterion, column_name AS 'column', value AS 'order' FROM ?? WHERE ? ORDER BY priority ASC`, [table, {report_id}]);
		return this.query(sql);
	}
	getLimitBy({report_id})
	{
		const table = 'report_limits';
		const sql = this.prepare(`SELECT criterion, span, comparison FROM ?? WHERE ?`, [table, {report_id}]);
		return this.query(sql);
	}
	async getReports(sessionid, criteria = {})
	{
		const test = () => true;
		const userid = await this.authorizeAccess(sessionid, test);
		const table = 'reports';
		const orderby = 'user_id';
		const where = this.where(criteria);
		const sql = (where === '')
			? this.prepare(`SELECT * FROM ?? WHERE ? OR ? ORDER BY ??`, [table, {user_id:userid}, {private_report:false}, orderby])
			: this.prepare(`SELECT * FROM ??${where} ORDER BY ??`, [table, orderby]);
		const rows = await this.query(sql);
		for (const row of rows)
		{
			const {report_id} = row;
			const report = {report_id};
			const workers = [this.getReportColumns(report), this.getFilterBy(report), this.getSortBy(report), this.getLimitBy(report)];
			const [columnCriteria, filterCriteria, sortCriteria, limitCriteria] = await Promise.all(workers);
			assign({columnCriteria, filterCriteria, sortCriteria, limitCriteria}).to(row);
		}
		return rows;
	}
	removeReportCriterion(table, report_id)
	{
		const sql = this.prepare(`DELETE FROM ?? WHERE ?`, [table, {report_id}]);
		return this.query(sql);
	}
	insertReportCriterion(table, values)
	{
		const sql = this.prepare(`INSERT INTO ?? SET ?`, [table, values]);
		return this.query(sql);
	}
	removeReportColumn({report_id})
	{
		return this.removeReportCriterion('report_columns', report_id);
	}
	removeFilterBy({report_id})
	{
		return this.removeReportCriterion('report_filters', report_id);
	}
	removeSortBy({report_id})
	{
		return this.removeReportCriterion('report_sorts', report_id);
	}
	removeLimitBy({report_id})
	{
		return this.removeReportCriterion('report_limits', report_id);
	}
	newReportColumn(values)
	{
		return this.insertReportCriterion('report_columns', values);
	}
	newFilterBy(values)
	{
		return this.insertReportCriterion('report_filters', values);
	}
	newSortBy(values)
	{
		return this.insertReportCriterion('report_sorts', values);
	}
	newLimitBy(values)
	{
		return this.insertReportCriterion('report_limits', values);
	}
	async updateReport(sessionid, {report_name, datasource, private_report, columnCriteria, filterCriteria, sortCriteria, limitCriteria} = {}, criteria)
	{
		const reports = await this.getReports(sessionid, criteria);
		if (reports.length === 0) {throw 'no reports match query';}
		if (reports.length > 1) {throw 'attempt to modify multiple reports canceled';}
		const [{report_id}] = reports;
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('generateReports'));
		const user_id = await this.authorizeAccess(sessionid, test);
		const table = 'reports';
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(user_id, table, `update report ${report_id}`);
		const report = {report_id};
		const sql = this.prepare(`UPDATE ?? SET ? WHERE ?`, [table, {report_name, datasource, private_report}, report]);
		await this.query(sql).then(refresh, reject);
		const clean = ['removeReportColumn', 'removeFilterBy', 'removeSortBy', 'removeLimitBy'];
		await Promise.all(clean.map(remove => this[remove](report)));
		const workers = [
			Promise.all(columnCriteria.map((criterion, priority) => this.newReportColumn({report_id, priority, ...criterion}))),
			Promise.all(filterCriteria.map((criterion, priority) => this.newFilterBy({report_id, priority, ...criterion}))),
			Promise.all(sortCriteria.map((criterion, priority) => this.newSortBy({report_id, priority, ...criterion}))),
			Promise.all(limitCriteria.map((criterion) => this.newLimitBy({report_id, ...criterion})))
		];
		await Promise.all(workers);
	}
	async removeReport(sessionid, {report_id})
	{
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('generateReports'));
		const user_id = await this.authorizeAccess(sessionid, test);
		const table = 'reports';
		const refresh = ({affectedRows}) => affectedRows && this.logActivity(user_id, table, `removed report ${report_id}`);
		const sql = this.prepare(`DELETE FROM ?? WHERE ?`, [table, {report_id}]);
		await this.query(sql).then(refresh, reject);
	}
	async newReport(sessionid, {report_name, datasource, private_report, columnCriteria, filterCriteria, sortCriteria, limitCriteria} = {})
	{
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('generateReports'));
		const user_id = await this.authorizeAccess(sessionid, test);
		const table = 'reports';
		let report_id;
		const refresh = ({affectedRows, insertId}) => affectedRows && this.logActivity(user_id, table, `add new report ${report_id = insertId}`);
		const sql = this.prepare(`INSERT INTO ?? SET ?`, [table, {report_name, user_id, datasource, private_report}]);
		await this.query(sql).then(refresh, reject);
		const saves = [
			Promise.all(columnCriteria.map((criterion, priority) => this.newReportColumn({report_id, priority, ...criterion}))),
			Promise.all(filterCriteria.map((criterion, priority) => this.newFilterBy({report_id, priority, ...criterion}))),
			Promise.all(sortCriteria.map((criterion, priority) => this.newSortBy({report_id, priority, ...criterion}))),
			Promise.all(limitCriteria.map((criterion) => this.newLimitBy({report_id, ...criterion})))
		];
		await Promise.all(saves);
	}
	async lockRecord(sessionid, {table_name, primary_key, key_value}, lock = false)
	{
		// this method only checks that the calling session is logged in
		// this could be exploited by a malicious client, but not in any destructive manner
		// all precautions are taken to circumvent SQL code injection and malformed queries
		const test = () => true;
		await this.authorizeAccess(sessionid, test);
		const recordLocks = 'record_locks', lockTime = 'lock_time';
		let sql = this.prepare('SELECT * FROM ?? WHERE ?? = ?', [table_name, primary_key, key_value]);
		const rows = await this.query(sql);
		// prevent locking on non-existent records
		if (rows.length === 0) {return `no records match query: ${table_name}, ${primary_key}, ${key_value}`;}
		// should be an impossible result
		if (rows.length > 1) {throw `attempt to ${lock ? 'lock' : 'unlock'} multiple records canceled`;}
		// the record_locks table has a unique key on (table_name, primary_key, key_value)
		// a manual check is necessary to prevent modification of an existing record owned by another session
		sql = this.prepare('SELECT * FROM ?? WHERE ? AND ? AND ?', [recordLocks, {table_name}, {primary_key}, {key_value}]);
		const locks = await this.query(sql);
		if (isEqual(locks.length, 1))
		{
			const [{lock_id, session_id}] = locks;
			if (session_id !== sessionid) {throw 'record locked by another user session';}
			sql = lock
				// an existing lock owned by the current session already exists
				? this.prepare('UPDATE ?? SET ?? = NOW()', [recordLocks, lockTime])
				// or an existing lock exists, and the session wants to release it
				: this.prepare('DELETE FROM ?? WHERE ?', [recordLocks, {lock_id}]);
		}
		else if (lock)
		{
			// a new lock record needs to be created
			sql = this.prepare('INSERT INTO ?? SET ?', [recordLocks, {session_id:sessionid, table_name, primary_key, key_value}]);
		}
		await this.query(sql);
	}
	getFilter(criterion, operator, column, value)
	{
		const unpack = packed => {
			const arr = [];
			for (let i = 0; i < 7; ++i) {arr[i] = packed >>> i & 1;}
			return arr;
		};
		const dayofweek = () => {
			const delimiter = isEqual(operator, '=') ? ' OR ' : ' AND ';
			const transform = (enabled, day) => enabled ? `DAYOFWEEK(${column}) ${operator} ${day}` : null;
			const sql = unpack(value).map((enabled, index) => transform(enabled, index+1)).filter(identity).join(delimiter);
			return `(${sql})`;
		};
		const condition = this.prepare('?', value);
		const absolutetime = () => `DATE(${column}) ${operator} DATE(${condition})`;
		const timeofday = () => `HOUR(${column}) ${operator} ${condition}`;
		const videotype = () => +value ? `${column} != 'N'` : `${column} = 'N'`;
		const typical = () => `${column} ${operator} ${condition}`;
		const filters = {dayofweek, absolutetime, timeofday, videotype};
		const filter = filters[criterion] || typical;
		return filter();
	}
	generateColumn(first, {criterion})
	{
		const conjunction = first ? 'SELECT' : ',';
		return `${conjunction} ${criterion}`;
	}
	generateFilter(first, {criterion, conjunction, column, operator, condition})
	{
		column = this.prepare('??', column);
		conjunction = first ? ' WHERE' : ` ${conjunction}`;
		if (isEqual(operator, 'CONTAINS'))
		{
			condition = `%${condition}%`;
			operator = 'LIKE';
		}
		else if (isEqual(operator, 'STARTSWITH'))
		{
			condition = `${condition}%`;
			operator = 'LIKE';
		}
		else if (isEqual(operator, 'ENDSWITH'))
		{
			condition = `%${condition}`;
			operator = 'LIKE';
		}
		else if (isEqual(operator, 'BEFORE'))
		{
			operator = '<';
		}
		else if (isEqual(operator, 'AFTER'))
		{
			operator = '>';
		}
		if (isEqual(criterion, 'absolutetime')) {condition = new Date(condition);}
		const filter = this.getFilter(criterion, operator, column, condition);
		return `${conjunction} ${filter}`;
	}
	generateSort(first, {column, order})
	{
		column = this.prepare('??', column);
		const conjunction = first ? ' ORDER BY' : ',';
		return `${conjunction} ${column} ${order}`;
	}
	processCriteria(report)
	{
		const {datasource, columnCriteria, filterCriteria, sortCriteria, limitCriteria} = report;
		const table = {activities:'display_activity', meetings:'display_meetings'}[datasource];
		const first = index => isEqual(index, 0);
		const format = column => this.prepare('??', column);
		const from = table => [this.prepare(' FROM ??', [table])];
		const allColumns = () => isEmpty(columnCriteria);
		const columns = () => allColumns() ? 'SELECT *' : columnCriteria.map((values, index) => this.generateColumn(first(index), values));
		const filters = () => filterCriteria.map((values, index) => this.generateFilter(first(index), values));
		const sorts = () => sortCriteria.map((values, index) => this.generateSort(first(index), values));
		const sql = table => [columns, from, filters, sorts].map(generator => generator(table).join('')).join('');
		const allResults = isEqual(0, limitCriteria.length);
		if (allResults) {return sql(table);}
		const where = column => ({
			all:'',
			today:`WHERE DATE(${column}) = DATE(NOW())`,
			lastweek:`WHERE YEAR(${column}) = YEAR(NOW()) AND WEEK(${column}) = WEEK(NOW() - INTERVAL 1 WEEK)`,
			thisweek:`WHERE YEAR(${column}) = YEAR(NOW()) AND WEEK(${column}) = WEEK(NOW())`,
			nextweek:`WHERE YEAR(${column}) = YEAR(NOW()) AND WEEK(${column}) = WEEK(NOW() + INTERVAL 1 WEEK)`,
			thismonth:`WHERE MONTH(${column}) = MONTH(NOW()) AND YEAR(${column}) = YEAR(NOW())`,
			thisyear:`WHERE YEAR(${column}) = YEAR(NOW())`,
			prior1day:`WHERE ${column} >= NOW() - INTERVAL 1 DAY`,
			prior7days:`WHERE ${column} >= NOW() - INTERVAL 7 DAY`,
			prior30days:`WHERE ${column} >= NOW() - INTERVAL 30 DAY`,
			prior365days:`WHERE ${column} >= NOW() - INTERVAL 365 DAY`
		});
		const [{criterion, span}] = limitCriteria;
		let column;
		switch (criterion)
		{
			case 'rows':
			{
				return `${sql(table)} LIMIT ${span}`;
			}
			case 'timerange':
			{
				column = format('timestamp');
				break;
			}
			case 'futuremeetings':
			case 'relativedates':
			{
				column = format('meetingtime');
				break;
			}
		}
		const inner = format('inner');
		return `WITH ${inner} AS (SELECT *${from(table)} ${where(column)[span]}) ${sql('inner')}`;
	}
	async generateReport(sessionid, criteria)
	{
		const test = (committee, permissions) => Boolean(+committee === 0 && permissions.includes('generateReports'));
		const user_id = await this.authorizeAccess(sessionid, test);
		const [report] = await this.getReports(sessionid, criteria);
		const {report_id, datasource} = report;
		const sql = this.processCriteria(report);
		await this.logActivity(user_id, datasource, `generate report ${report_id}`);
		console.log(sql);
		return await this.query(sql);
	}
	end()
	{
		// close underlying socket
		this.socket.end();
		this.log('exiting gracefully');
	}
	request({command, sql, values, sessionid, username, password, criteria})
	{
		// this method is called from the parent process through the IPC mechanism
		// enumerating the available commands here allows the getCommands method to expose child query methods to the parent process
		const commands = {
			query:() => this.query(sql, values),
			recallSession:() => this.recallSession(sessionid),
			endSession:() => this.endSession(sessionid),
			authenticateUser:() => this.authenticateUser(username, password, sessionid),
			getSettings:() => this.getSettings(sessionid),
			removeSetting:() => this.deleteSetting(sessionid, values),
			updateSetting:() => this.updateSetting(sessionid, values, criteria),
			newSetting:() => this.newSetting(sessionid, values),
			getCommittees:() => this.getCommittees(sessionid),
			removeCommittee:() => this.deleteCommittee(sessionid, values),
			updateCommittee:() => this.updateCommittee(sessionid, values, criteria),
			newCommittee:() => this.newCommittee(sessionid, values),
			getGroups:() => this.getGroups(sessionid),
			removeGroup:() => this.deleteGroup(sessionid, values),
			updateGroup:() => this.updateGroup(sessionid, values, criteria),
			newGroup:() => this.newGroup(sessionid, values),
			getUsers:() => this.getUsers(sessionid, criteria),
			removeUser:() => this.deleteUser(sessionid, values),
			updateUser:() => this.updateUser(sessionid, values, criteria),
			newUser:() => this.newUser(sessionid, values),
			updatePassword:() => this.updatePassword(sessionid, values),
			getAttachments:() => this.getAttachments(sessionid),
			newAttachment:() => this.newAttachment(sessionid, values),
			getMeetings:() => this.getMeetings(sessionid, criteria),
			removeMeeting:() => this.removeMeeting(sessionid, values),
			updateMeeting:() => this.updateMeeting(sessionid, values, criteria),
			newMeeting:() => this.newMeeting(sessionid, values),
			getReports:() => this.getReports(sessionid, criteria),
			removeReport:() => this.removeReport(sessionid, values),
			updateReport:() => this.updateReport(sessionid, values, criteria),
			newReport:() => this.newReport(sessionid, values),
			generateReport:() => this.generateReport(sessionid, criteria),
			lockRecord:() => this.lockRecord(sessionid, values, true),
			unlockRecord:() => this.lockRecord(sessionid, values, false),
			getActivity:() => this.getActivity(sessionid, values, criteria),
			getLegislativeSessions:() => this.getLegislativeSessions(sessionid),
			getCommands:() => resolve(iterable(commands, KEYS))
		};
		const exception = error => reject(isEmpty(error) ? 'a general exception occurred' : error);
		// this statement presumes that all commands return promises
		return command && commands[command] ? commands[command]().catch(exception) : reject('unknown command: '+command);
	}
	constructor(options, devices, interval)
	{
		super(devices);
		const {node} = this;
		const {port} = options;
		const init = async () => {
			if (!includes(node).in(devices)) {throw 'device not found';}
			const events = {error:this.error.bind(this)};
			this.device = devices[node];
			this.socket = bind(events).to(mysql(options));
			this.socket.connect(e => e ? this.error(e) : this.flags({connected:true}).poll(this.refresh));
			// trigger ready event listener in parent process
			this.ready();
		};
		// assign global listeners
		const events = {
			ready() {this.log('connection established');},
			connect() {this.log(`connecting to ${node}:${port}`);},
			setInterval(query) {this.setInterval(query);}
		};
		bind(events).to(this);
		// set polling interval
		this.setInterval({interval});
		// connect or die
		this.connect(init);
	}
}
new Mysql(CONNECTION(), DEVICES, REFRESHINTERVAL);
