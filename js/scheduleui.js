/* global Helpers, b64_md5 */
/* eslint no-self-assign:off */
const REPOSITORY = 'repository/';
const defaultOption = '<option value="0">Select...</option>';
function MD5(str)
{
	// call MD5 algorithm written by Paul Johnston
	return b64_md5(str);
}
class Screen {
	constructor(screen, goto, show)
	{
		const {isEqual, isObject, isFunction, iterable, identity} = Helpers;
		// storage to hold user path settings for this screen
		this._path = {screen};
		const noop = () => {};
		const path = path => {
			if (isObject(path))
			{
				for (const [key, val] of iterable(path))
				{
					if (isEqual(val, 'undefined'))
					{
						delete path[key];
						delete this._path[key];
					}
				}
				// go to the requested path if it is specified
				// otherwise return to the stored path
				Object.assign(this._path, goto(path), {screen});
			}
			return UI.setHashParams(this._path);
		};
		if (isFunction(show))
		{
			this.focus = path => {
				// provide a path object to change the internal screen path
				// provide a null path to simply show the screen without changing the existing path
				setPath(path);
				show(true);
			};
			this.blur = () => show(false);
		}
		else {this.focus = this.blur = noop;}
		const setPath = isFunction(goto) ? path : identity;
	}
}
class Menu
{
	set visible(visible)
	{
		this._visible = visible;
		this._node && UI.toggleVisibility(this._node, visible);
	}
	get visible()
	{
		return this._visible;
	}
	click()
	{
		this.visible ^= 1;
	}
	constructor(node)
	{
		this.visible = false;
		this._node = node;
	}
}
class Control
{
	// control abstract class to define prototype methods for most controls
	get isEnum()
	{
		return this.type === 'select';
	}
	get isBoolean()
	{
		return this.type === 'checkbox';
	}
	get isDoW()
	{
		return this.type === 'dayofweek';
	}
	get isToD()
	{
		return this.type === 'timeofday';
	}
	set value(value)
	{
		this.isBoolean ? UI.find(this.element, 'input[type=checkbox]').checked = Boolean(value) : this.element.value = value;
	}
	get value()
	{
		return this.isBoolean ? UI.find(this.element, 'input[type=checkbox]').checked : this.element.value;
	}
	set control(html)
	{
		this._element = UI.createElement(html);
	}
	get control()
	{
		return this;
	}
	get element()
	{
		return this._element;
	}
	set onchange(handler)
	{
		this._onchange = handler;
	}
	get onchange()
	{
		const {isFunction} = Helpers;
		return isFunction(this._onchange) ? () => this._onchange() : () => {};
	}
	constructor(type)
	{
		this.type = type;
	}
}
class EnumeratedControl extends Control
{
	// a specialization of the control abstract class to define prototype methods for indexed controls
	set index(value)
	{
		this._index = value;
		UI.toggleFlow(this._conjunction, value);
		this._remove && UI.setData(this._remove, {index:value});
	}
	get index()
	{
		return this._index;
	}
	append(type, node)
	{
		const {isEqual} = Helpers;
		const parent = isEqual(type, 'conjunction') ? this.element : this.label;
		if (parent)
		{
			this['_' + type] = node.control;
			UI.append(node.element, parent);
			node.onchange = () => this.onchange();
		}
		return this;
	}
	constructor(type)
	{
		super(type);
	}
}
class Remove extends Control
{
	set control(html)
	{
		this._element = UI.createElement(html);
	}
	get control()
	{
		return this._element;
	}
	constructor(type, index)
	{
		super('button');
		const types = {
			columns:'Column',
			filters:'Filter',
			sorts:'Sort',
			limits:'Limit'
		};
		this.control = `<button title="Remove ${types[type]}" class="btn btn-transparent super small tight fas fa-times-circle darkred removeCriterion" data-type="${type}" data-index="${index}">`;
	}
}
class TimeOfDay extends Control
{
	toUTC(hours)
	{
		const x = new Date();
		const offset = x.getTimezoneOffset() / 60;
		return (hours + offset) % 24;
	}
	constructor(selected = 8)
	{
		super('select')
		selected = +selected;
		const {isEqual} = Helpers;
		const times = ['12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM', '4:00 AM', '5:00 AM', '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'];
		const options = times.map((time, value) => `<option value="${this.toUTC(value)}"${isEqual(this.toUTC(value), selected) ? ' selected' : ''}>${time}</option>`);
		this.control = `<select class="padMed marginSmall timeofday">${options}</select>`;
		this.element.onchange = () => this.onchange();
	}
}
class ToggleButton extends Control
{
	set checked(checked)
	{
		const {notEqual} = Helpers;
		const prev = this._is_checked;
		UI.toggleClass(this.control, 'btn-primary', checked);
		UI.toggleClass(this.control, 'btn-light', !checked);
		notEqual(prev, this._is_checked = Boolean(checked)) && this.onchange();
	}
	get checked()
	{
		return this._is_checked || false;
	}
	set value(value)
	{
		this.checked = value;
	}
	get value()
	{
		return +this.checked;
	}
	constructor(label, selected = false)
	{
		super('togglebutton');
		this.control = `<button class="btn btn-light marginSmall">${label}</button>`;
		this.element.onclick = () => this.value ^= 1;
		this.value = selected;
	}
}
class DayOfWeek extends Control
{
	static pack(arr)
	{
		let packed = 0;
		for (let i = 0; i < 7; ++i) {packed |= arr[i] ? 1 << i : 0;}
		return packed;
	}
	static unpack(packed)
	{
		const arr = [];
		for (let i = 0; i < 7; ++i) {arr[i] = packed >>> i & 1;}
		return arr;
	}
	append(node)
	{
		if (this.element)
		{
			UI.append(node.element, this.element);
			node.onchange = () => this.onchange();
		}
		return this;
	}
	set value(value)
	{
		const selected = DayOfWeek.unpack(+value);
		this.controls.forEach(control => control.value = selected.shift() || 0);
	}
	get value()
	{
		return DayOfWeek.pack(this.controls.map(control => control.value));
	}
	constructor(selected = 0b0111110)
	{
		super('dayofweek');
		const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		this.control = `<span class="dayOfWeek"></span>`;
		this.controls = labels.map(label => new ToggleButton(label));
		this.controls.forEach(control => this.append(control));
		this.value = selected;
	}
}
class Condition extends Control
{
	constructor(name, type, values, selected)
	{
		super(type);
		const {iterable} = Helpers;
		if (this.isEnum)
		{
			const options = iterable(values).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`);
			this.control = `<select class="padMed marginSmall">${options.join('')}</select>`;
			this.element.onchange = () => this.onchange();
		}
		else if (this.isBoolean)
		{
			const checked = +selected ? ' checked' : '';
			this.control = `<button class="btn btn-light marginSmall checkButton">${name}:&nbsp;<input type="checkbox" tabindex="-1"${checked}></button>`;
			this.element.onchange = () => this.onchange();
		}
		else if (this.isDoW) {return new DayOfWeek(selected);}
		else if (this.isToD) {return new TimeOfDay(selected);}
		else
		{
			this.control = `<input type="${type}" spellcheck="false" value="${selected}" class="marginSmall">`;
			this.element.oninput = () => this.onchange();
		}
	}
}
class Conjunction extends Control
{
	get classList()
	{
		return this.element.classList;
	}
	constructor(values, selected)
	{
		super('button');
		const {isEqual} = Helpers;
		switch (values.length)
		{
			case 1:
			{
				this.control = `<input type="button" value="${values[0]}" class="btn btn-secondary margin">`;
				break;
			}
			case 2:
			{
				isEqual(values[1], selected) && values.reverse();
				this.control = `<input type="button" value="${values[0]}" class="btn btn-secondary margin">`;
				this.element.onclick = () => {
					values.reverse();
					this.element.value = values[0];
					this.onchange();
				};
				break;
			}
		}
	}
}

class Operator extends Control
{
	constructor(values, selected)
	{
		super('button');
		const {isEqual} = Helpers;
		switch (values.length)
		{
			case 1:
			{
				this.control = `<input type="button" value="${values[0]}" class="btn btn-secondary marginSmall">`;
				break;
			}
			case 2:
			{
				isEqual(values[1], selected) && values.reverse();
				this.control = `<input type="button" value="${values[0]}" class="btn btn-secondary marginSmall">`;
				this.element.onclick = () => {
					values.reverse();
					this.element.value = values[0];
					this.onchange();
				};
				break;
			}
			default:
			{
				this.type = 'select';
				const options = values.map(value => `<option value="${value}"${isEqual(value, selected) ? ' selected' : ''}>${value}</option>`);
				this.control = `<select class="padMed marginSmall">${options.join('')}</select>`;
				this.element.onchange = () => this.onchange();
			}
		}
	}
}
class LimitBy extends EnumeratedControl
{
	set comparison(value)
	{
		this._comparison.value = value;
	}
	get comparison()
	{
		return this._comparison ? this._comparison.value : null;
	}
	set span(value)
	{
		this._span.value = value;
	}
	get span()
	{
		return this._span ? this._span.value : null;
	}
	get value()
	{
		const {criterion, span, comparison} = this;
		return {criterion, span, comparison};
	}
	extract(type)
	{
		return this['_' + type];
	}
	append(type, node)
	{
		if (this.label)
		{
			this['_' + type] = node.control;
			UI.append(node.element, this.label);
			node.onchange = () => this.onchange();
		}
		return this;
	}
	constructor(limits, criterion, span, comparison, index = 0)
	{
		super('limit');
		this.valid = false;
		const {includes} = Helpers;
		if (!includes(criterion).in(limits)) {return this;}
		const {assign, isUndefined, iterable, KEYS} = Helpers;
		const {name, type, spans, comparisons} = limits[criterion];
		// strip any extraneous properties and import valid keys
		assign({index, name, type, criterion}).to(this);
		if (this.isEnum)
		{
			if (isUndefined(span)) {[span] = iterable(spans, KEYS);}
			if (includes(span).in(spans)) {this.valid = true;}
		}
		else
		{
			if (isUndefined(span)) {span = spans;}
			this.valid = true;
		}
		if (this.valid)
		{
			const condition = new Condition(name, type, spans, span);
			this.control = '<span class="reportLimit"></span>';
			this.label = UI.createElement(`<span><span class="larger">${name}</span></span>`);
			this.append('remove', new Remove('limits', index));
			this.append('span', condition);
			if (comparisons)
			{
				this.append('conjunction', new Conjunction(['WITH'], 'WITH'));
				this.append('comparison', new Condition('Compare To', type, comparisons, comparison));
			}
			UI.append(this.label, this.element);
		}
	}
}
class SortBy extends EnumeratedControl
{
	set operator(value)
	{
		this._operator.value = value;
	}
	get operator()
	{
		return this._operator ? this._operator.value : null;
	}
	set order(value)
	{
		this._order.value = value;
	}
	get order()
	{
		return this._order ? this._order.value : null;
	}
	get value()
	{
		const {criterion, column, order} = this;
		return {criterion, column_name:column, value:order};
	}
	constructor(sorts, criterion, column, selected, index)
	{
		super('sort');
		this.valid = false;
		const {includes} = Helpers;
		if (!includes(criterion).in(sorts)) {return this;}
		const {name, type, columns} = sorts[criterion];
		if (includes(column).in(columns))
		{
			const orders = columns[column];
			if (includes(selected).in(orders))
			{
				this.valid = true;
				// strip any extraneous properties and import valid keys
				Object.assign(this, {index, name, criterion, column});
				this.control = '<span class="reportSort"></span>';
				this.label = UI.createElement(`<span><span class="larger">${name}</span></span>`);
				this.append('remove', new Remove('sorts', index));
				this.append('conjunction', new Conjunction(['THEN'], 'THEN'));
				this.append('order', new Condition(name, type, orders, selected));
				UI.append(this.label, this.element);
			}
		}
	}
}
class FilterBy extends EnumeratedControl
{
	set conjunction(value)
	{
		this._conjunction.value = value
	}
	get conjunction()
	{
		return this._conjunction ? this._conjunction.value : null;
	}
	set operator(value)
	{
		this._operator.value = value;
	}
	get operator()
	{
		return this._operator ? this._operator.value : null;
	}
	set condition(value)
	{
		this._condition.value = value;
	}
	get condition()
	{
		return this._condition ? this._condition.value : null;
	}
	get value()
	{
		const {conjunction, criterion, operator, column, condition} = this;
		return {conjunction, criterion, operator, column_name:column, value:condition};
	}
	constructor(filters, criterion, operator, condition, conjunction, index)
	{
		super();
		this.valid = false;
		const {includes} = Helpers;
		if (!includes(criterion).in(filters)) {return this;}
		// strip any extraneous properties and import valid keys
		const {assign, isNull, iterable, KEYS, VALUES} = Helpers;
		const {name, type, columns, operators} = filters[criterion];
		if (includes(operator).in(operators))
		{
			this.valid = true;
			const [column] = iterable(columns, KEYS);
			const conditions = columns[column];
			assign({index, name, type, criterion, column}).to(this);
			this.control = '<span class="reportFilter"></span>';
			this.label = UI.createElement(`<span><span class="larger">${name}</span></span>`);
			isNull(condition) && ([condition] = iterable(conditions, VALUES));
			this.append('remove', new Remove('filters', index));
			this.append('conjunction', new Conjunction(['AND', 'OR'], conjunction));
			this.append('operator', new Operator(operators, operator));
			this.append('condition', new Condition(name, type, conditions, condition));
			UI.append(this.label, this.element);
		}
	}
}
class Column extends EnumeratedControl
{
	get value()
	{
		const {criterion} = this;
		return {criterion};
	}
	constructor(columns, criterion, index = 0)
	{
		const {assign, includes} = Helpers;
		super();
		this.valid = false;
		if (!includes(criterion).in(columns)) {return this;}
		const {name} = columns[criterion];
		this.valid = true;
		// strip any extraneous properties and import valid keys
		assign({index, name, criterion}).to(this);
		this.control = '<span class="reportColumn"></span>';
		this.label = UI.createElement(`<span><span class="larger">${name}</span></span>`);
		this.append('remove', new Remove('columns', index));
		UI.append(this.label, this.element);
	}
}
class ReportControls
{
	refreshColumnIndexes()
	{
		const resequence = (column, index) => {
			column.index = index;
			UI.append(column.element, this.columnNode);
		};
		UI.empty(this.columnNode);
		this.columnCriteria.forEach(resequence);
	}
	addColumn(column, index, refresh = true)
	{
		const {isNull} = Helpers;
		const rangeCheck = val => 0 <= val && val <= this.columnCriteria.length;
		if (column.valid)
		{
			if (isNull(index))
			{
				this.columnCriteria.push(column);
				refresh && this.refreshColumnIndexes();
				return true;
			}
			else if (rangeCheck(index))
			{
				this.columnCriteria.splice(index, 0, column);
				refresh && this.refreshColumnIndexes();
				return true;
			}
		}
		return false;
	}
	removeColumn(index, refresh = true)
	{
		const rangeCheck = val => 0 <= val && val < this.columnCriteria.length;
		if (rangeCheck(index))
		{
			this.columnCriteria.splice(index, 1);
			refresh && this.refreshColumnIndexes();
			return true;
		}
		return false;
	}
	refreshFilterIndexes()
	{
		const resequence = (filter, index) => {
			filter.index = index;
			UI.append(filter.element, this.filterNode);
		};
		UI.empty(this.filterNode);
		this.filterCriteria.forEach(resequence);
	}
	addFilterBy(filter, index, refresh = true)
	{
		const {isNull} = Helpers;
		const rangeCheck = val => 0 <= val && val <= this.filterCriteria.length;
		if (filter.valid)
		{
			if (isNull(index))
			{
				this.filterCriteria.push(filter);
				refresh && this.refreshFilterIndexes();
				return true;
			}
			else if (rangeCheck(index))
			{
				this.filterCriteria.splice(index, 0, filter);
				refresh && this.refreshFilterIndexes();
				return true;
			}
		}
		return false;
	}
	removeFilterBy(index, refresh = true)
	{
		const rangeCheck = val => 0 <= val && val < this.filterCriteria.length;
		if (rangeCheck(index))
		{
			this.filterCriteria.splice(index, 1);
			refresh && this.refreshFilterIndexes();
			return true;
		}
		return false;
	}
	reorderFilterBy(from, to)
	{
		const {isEqual, isUndefined} = Helpers;
		const rangeCheck = val => 0 <= val && val < this.filterCriteria.length;
		if (isUndefined(to)) {to = this.filterCriteria.length - 1;}
		if (isEqual(from, to)) {return true;}
		if (rangeCheck(from) && rangeCheck(to))
		{
			const filter = this.filterCriteria[from];
			if (from > to)
			{
				if (this.removeFilterBy(from, false) && this.addFilterBy(filter, to)) {return true;}
			}
			else
			{
				if (this.addFilterBy(filter, to + 1, false) && this.removeFilterBy(from)) {return true;}
			}
		}
		return false;
	}
	refreshSortIndexes()
	{
		const resequence = (sort, index) => {
			sort.index = index;
			UI.append(sort.element, this.sortNode);
		};
		UI.empty(this.sortNode);
		this.sortCriteria.forEach(resequence);
	}
	addSortBy(sort, index, refresh = true)
	{
		const {isNull} = Helpers;
		const rangeCheck = val => 0 <= val && val <= this.sortCriteria.length;
		if (sort.valid)
		{
			if (isNull(index))
			{
				this.sortCriteria.push(sort);
				refresh && this.refreshSortIndexes();
				return true;
			}
			else if (rangeCheck(index))
			{
				this.sortCriteria.splice(index, 0, sort);
				refresh && this.refreshSortIndexes();
				return true;
			}
		}
		return false;
	}
	removeSortBy(index, refresh = true)
	{
		const rangeCheck = val => 0 <= val && val < this.sortCriteria.length;
		if (rangeCheck(index))
		{
			this.sortCriteria.splice(index, 1);
			refresh && this.refreshSortIndexes();
			return true;
		}
		return false;
	}
	reorderSortBy(from, to)
	{
		const {isEqual, isUndefined} = Helpers;
		const rangeCheck = val => 0 <= val && val < this.sortCriteria.length;
		if (isUndefined(to)) {to = this.sortCriteria.length - 1;}
		if (isEqual(from, to)) {return true;}
		if (rangeCheck(from) && rangeCheck(to))
		{
			const sort = this.sortCriteria[from];
			if (from > to)
			{
				if (this.removeSortBy(from, false) && this.addSortBy(sort, to)) {return true;}
			}
			else
			{
				if (this.addSortBy(sort, to + 1, false) && this.removeSortBy(from)) {return true;}
			}
		}
		return false;
	}
	toggleAddLimit(disable)
	{
		UI.toggleDisabled(UI.find(UI.getElement('reportEdit'), 'button#addLimit'), disable);
	}
	addLimitBy(limit)
	{
		if (limit.valid)
		{
			this.limitCriteria = [limit];
			UI.empty(this.limitNode);
			UI.append(limit.element, this.limitNode);
			this.toggleAddLimit(true);
		}
	}
	removeLimitBy()
	{
		UI.empty(this.limitNode);
		this.limitCriteria = [];
		this.toggleAddLimit(false);
	}
	get value()
	{
		const {columnCriteria, filterCriteria, sortCriteria, groupCriteria, limitCriteria} = this;
		const {prop} = Helpers;
		const getValues = criteria => criteria.map(prop('value'));
		return {columnCriteria:getValues(columnCriteria), filterCriteria:getValues(filterCriteria), sortCriteria:getValues(sortCriteria), groupCriteria:getValues(groupCriteria), limitCriteria:getValues(limitCriteria)};
	}
	constructor(report, columns, columnNode, filterNode, sortNode, limitNode)
	{
		const {datasource, columnCriteria, filterCriteria, sortCriteria, limitCriteria} = report;
		const {assign} = Helpers;
		assign({datasource, columnNode, filterNode, sortNode, limitNode, columnCriteria:[], filterCriteria:[], groupCriteria:[], sortCriteria:[], limitCriteria:[]}).to(this);
		const senateCommittees = columns.getCommittees('S');
		const houseCommittees = columns.getCommittees('H');
		const sessions = columns.getSessions();
		const limitPrototypes = {
			activities:{
				rows:{
					name:'Max Rows',
					type:'number',
					spans:100
				},
				timerange:{
					name:'Time Range',
					type:'select',
					spans:{prior1day:'Last 24 Hours', prior7days:'Last 7 Days', prior30days:'Last 30 Days', prior365daysr:'Last 1 Year'},
				}
			},
			meetings:{
				rows:{
					name:'Max Rows',
					type:'number',
					spans:100
				},
				futuremeetings:{
					name:'Future Meetings',
					type:'select',
					spans:{all:'All', nextweek:'Next Week'}
				},
				relativedates:{
					name:'Relative Dates',
					type:'select',
					spans:{today:'Today', thisweek:'This Week', thismonth:'This Month', thisyear:'This Year'}
				}
			}
		};
		const sortPrototypes = {
			activities:{
				time:{
					name:'Timestamp',
					type:'select',
					columns:{event_timestamp:{DESC:'Descending', ASC:'Ascending'}}
				},
				user:{
					name:'User',
					type:'select',
					columns:{login_name:{DESC:'Descending', ASC:'Ascending'}}
				},
				event:{
					name:'Event Type',
					type:'select',
					columns:{event_type:{DESC:'Descending', ASC:'Ascending'}}
				}
			},
			meetings:{
				time:{
					name:'Date',
					type:'select',
					columns:{meetingtime:{DESC:'Descending', ASC:'Ascending'}}
				},
				committee:{
					name:'Committee',
					type:'select',
					columns:{committeename:{ASC:'Ascending', DESC:'Descending'}}
				}
			}
		};
		const filterPrototypes = {
			activities:{
				absolutetime:{
					name:'Specific Date',
					type:'date',
					columns:{event_timestamp:''},
					operators:['BEFORE', 'AFTER']
				},
				timeofday:{
					name:'Time of Day',
					type:'timeofday',
					columns:{event_timestamp:''},
					operators:['BEFORE', 'AFTER']
				},
				dayofweek:{
					name:'Day of Week',
					type:'dayofweek',
					columns:{event_timestamp:''},
					operators:['=', '!=']
				},
				event:{
					name:'Event Type',
					type:'text',
					columns:{event_type:''},
					operators:['CONTAINS', 'STARTS WITH', 'ENDS WITH']
				},
				table:{
					name:'Category',
					type:'select',
					columns:{table_name:{sessions:'Sessions', users:'Users', user_groups:'Groups', attachments:'Attachments'}},
					operators:['=']
				}
			},
			meetings:{
				absolutetime:{
					name:'Specific Date',
					type:'date',
					columns:{meetingtime:''},
					operators:['BEFORE', 'AFTER']
				},
				timeofday:{
					name:'Time of Day',
					type:'timeofday',
					columns:{meetingtime:''},
					operators:['BEFORE', 'AFTER']
				},
				dayofweek:{
					name:'Day of Week',
					type:'dayofweek',
					columns:{meetingtime:''},
					operators:['=', '!=']
				},
				location:{
					name:'Location',
					type:'text',
					columns:{location:''},
					operators:['CONTAINS', 'STARTS WITH', 'ENDS WITH']
				},
				title:{
					name:'Title',
					type:'text',
					columns:{committeename:''},
					operators:['CONTAINS', 'STARTS WITH', 'ENDS WITH']
				},
				session:{
					name:'Session',
					type:'select',
					columns:{sess_number:sessions},
					operators:['=', '!=', '>', '<', '>=', '<=']
				},
				chamber:{
					name:'Chamber',
					type:'select',
					columns:{chamber:{S:'Senate', H:'House', J:'Joint'}},
					operators:['=']
				},
				senatecommittee:{
					name:'Senate Committee',
					type:'select',
					columns:{senate_committee:senateCommittees},
					operators:['=', '!=']
				},
				housecommittee:{
					name:'House Committee',
					type:'select',
					columns:{house_commmittee:houseCommittees},
					operators:['=', '!=']
				},
				bill:{
					name:'Bill Number',
					type:'number',
					columns:{bill_list:''},
					operators:['=']
				},
				audience:{
					name:'Audience',
					type:'select',
					columns:{internal:{1:'Internal Only', 0:'Public'}},
					operators:['=']
				},
				canceled:{
					name:'Canceled',
					type:'checkbox',
					columns:{canceled:{}},
					operators:['=']
				},
				videotype:{
					name:'Broadcast',
					type:'checkbox',
					columns:{video_type:{}},
					operators:['=']
				}
			}
		};
		const columnPrototypes = {
			activities:{
				event_id:{name:'Event ID'},
				event_type:{name:'Event Type'},
				table_name:{name:'Table Name'},
				event_timestamp:{name:'Timestamp'},
				login_name:{name:'Username'}
			},
			meetings:{
				meeting_id:{name:'Meeting ID'},
				sess_number:{name:'Session Number'},
				chamber:{name:'Chamber'},
				publishtime:{name:'Publish Time'},
				meetingtime:{name:'Meeting Time'},
				displaytime:{name:'Display Time'},
				committeename:{name:'Meeting Title'},
				bill_list:{name:'Bill List'},
				special_requests:{name:'Special Requests'},
				notation:{name:'Notation'},
				phone:{name:'Phone'},
				location:{name:'Location'},
				agendalink:{name:'Agenda Link'},
				canceled:{name:'Canceled'},
				internal:{name:'Internal'},
				video_type:{name:'Video Type'},
				video_title:{name:'Video Title'},
				video_filename:{name:'Video Filenames'},
				video_duration:{name:'Video Durations'},
				youtube_video_id:{name:'YouTube ID'},
				feed_name:{name:'Feed Name'},
				house_committee:{name:'House Committee'},
				senate_committee:{name:'Senate Committee'}
			}
		};
		this.columns = columnPrototypes[datasource];
		this.filters = filterPrototypes[datasource];
		this.sorts = sortPrototypes[datasource];
		this.limits = limitPrototypes[datasource];
		UI.empty(this.columnNode);
		UI.empty(this.filterNode);
		UI.empty(this.sortNode);
		UI.empty(this.limitNode);
		this.toggleAddLimit(false);
		this.newColumn = ({criterion}, refresh = true) => this.addColumn(new Column(this.columns, criterion), null, refresh);
		this.newFilter = ({criterion, operator, condition, conjunction}, refresh = true) => this.addFilterBy(new FilterBy(this.filters, criterion, operator, condition, conjunction), null, refresh);
		this.newSort = ({criterion, column, order}, refresh = true) => this.addSortBy(new SortBy(this.sorts, criterion, column, order), null, refresh);
		this.newLimit = ({criterion, span, comparison}) => this.addLimitBy(new LimitBy(this.limits, criterion, span, comparison));
		columnCriteria.forEach(value => this.newColumn(value, false));
		filterCriteria.forEach(value => this.newFilter(value, false));
		sortCriteria.forEach(value => this.newSort(value, false));
		limitCriteria.forEach(value => this.newLimit(value));
		this.refreshColumnIndexes();
		this.refreshFilterIndexes();
		this.refreshSortIndexes();
	}
}
class DBObject
{
	// superclass provides default constructor for most database objects
	constructor(defaults, values, populate)
	{
		const {isFunction, iterable, KEYS} = Helpers;
		const defaultPopulate = (defaults, values) => iterable(defaults, KEYS).forEach(key => (this[key] = values[key] || defaults[key]));
		isFunction(populate) || (populate = defaultPopulate);
		populate.call(this, defaults, values);
	}
}
class Meeting extends DBObject
{
	constructor(values = {})
	{
		const {iterable, isEqual} = Helpers;
		const defaults = {
			meeting_id:0,
			sess_number:null,
			chamber:"0",
			publishtime:null,
			meetingtime:null,
			displaytime:null,
			committeename:'',
			bill_list:'',
			special_requests:'',
			notation:'',
			phone:'',
			location:'',
			agendalink:null,
			canceled:false,
			internal:false,
			video_type:'N',
			video_title:'',
			video_filename:'',
			video_duration:'',
			total_duration:'',
			youtube_video_id:'',
			feed_name:'',
			house_committee:0,
			senate_committee:0
		};
		const populate = function (defaults, values)
		{
			for (const [key, def] of iterable(defaults))
			{
				const value = values[key];
				if (isEqual(key, 'publishtime') || isEqual(key, 'meetingtime')) {this[key] = value ? (new Date(value)).setSeconds(0) : (new Date()).setSeconds(0);}
				else {this[key] = value || def;}
			}
		}
		super(defaults, values, populate);
	}
}
class User extends DBObject
{
	constructor(values = {})
	{
		const defaults = {
			user_id:0,
			login_name:'',
			first_name:'',
			last_name:'',
			senate_committee:"0",
			house_committee:"0",
			user_group:"0",
			system_admin:false,
			enabled:false
		};
		super(defaults, values);
		this.system_admin = Boolean(this.system_admin);
		this.enabled = Boolean(this.enabled);
	}
}
class Group extends DBObject
{
	constructor(values = {})
	{
		const defaults = {
			group_id:0,
			group_name:'',
			group_permissions:[],
			enabled:false
		};
		super(defaults, values);
		this.enabled = Boolean(this.enabled);
	}
}
class Committee extends DBObject
{
	constructor(values = {})
	{
		const defaults = {
			committee_id:0,
			committee_name:'',
			committee_chamber:"0"
		};
		super(defaults, values);
	}
}
class Setting extends DBObject
{
	constructor(values = {})
	{
		const defaults = {
			setting_id:0,
			setting_name:'',
			setting_value:''
		};
		super(defaults, values);
	}
}
class Report extends DBObject
{
	constructor(values = {})
	{
		const defaults = {
			report_id:0,
			user_id:"0",
			report_name:'',
			datasource:'none',
			private_report:false,
			columnCriteria:[],
			filterCriteria:[],
			sortCriteria:[],
			limitCriteria:[]
		};
		super(defaults, values);
		this.private_report = Boolean(this.private_report);
	}
}
class Upload
{
	handleFiles(files)
	{
		if (this.onStart(files))
		{
			files = [...files];
			this.initializeProgress(files.length);
			for (let i = 0; i < files.length; i++) {this.uploadFile(files[i], i);}
		}
	}
	constructor(dropzone, progress, onStart, onComplete)
	{
		this.onStart = onStart;
		const hover = 'hover';
		const uploadProgress = [];
		const {toggleFlow, toggleClass} = UI;
		const {sum, tee, resolve, reject, isEqual, parse} = Helpers;
		const onHover = () => toggleClass(dropzone, hover, true);
		const onLeave = () => toggleClass(dropzone, hover, false);
		const onDrop = ({dataTransfer}) => this.handleFiles(dataTransfer.files);
		const preventDefault = e => (e.preventDefault(), e.stopPropagation());
		const updateProgress = (fileNumber, percent) => {
			uploadProgress[fileNumber] = percent;
			const total = uploadProgress.reduce(sum, 0)/uploadProgress.length;
			progress.value = total;
			return progress;
		};
		this.initializeProgress = numFiles => {
			toggleFlow(progress, true);
			progress.value = 0;
			uploadProgress.length = 0;
			for (let i = numFiles; i > 0; i--) uploadProgress.push(0);
		};
		this.uploadFile = (file, i) => {
			const url = 'files/upload';
			const xhr = new XMLHttpRequest();
			const formData = new FormData();
			const progressListener = ({loaded, total}) => updateProgress(i, (loaded*100.0/total) || 100);
			const readyStateListener = () => {
				const {readyState, status, response} = xhr;
				const complete = isEqual(readyState, 4);
				if (complete)
				{
					const success = isEqual(status, 200);
					if (success)
					{
						toggleFlow(updateProgress(i, 100), false);
						onComplete(resolve(parse(response)));
					}
					else {onComplete(reject(status));}
				}
			};
			xhr.open('POST', url, true);
			xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
			xhr.addEventListener('readystatechange', readyStateListener);
			xhr.upload.addEventListener('progress', progressListener);
			formData.append('payload', file);
			xhr.send(formData);
		};
		const addListener = (node, callback) => eventName => node.addEventListener(eventName, callback, false);
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(tee(addListener(dropzone, preventDefault), addListener(document.body, preventDefault)));
		['dragenter', 'dragover'].forEach(addListener(dropzone, onHover, false));
		['dragleave', 'drop'].forEach(addListener(dropzone, onLeave, false));
		['drop'].forEach(addListener(dropzone, onDrop, false));
	}
}
class UI
{
	static createCookie(name, value, days)
	{
		let expires = '';
		if (days)
		{
			const moment = new Date();
			moment.setTime(moment.getTime() + (days*24*60*60*1000));
			expires = `; expires=${moment.toGMTString()}`;
		}
		document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}${expires}; SameSite=Strict; path=/`;
	}
	static readCookie(name)
	{
		const nameEQ = `${encodeURIComponent(name)}=`;
		const ca = document.cookie.split(';');
		for (let i = 0; i < ca.length; i++)
		{
			let c = ca[i];
			while (c.charAt(0) === ' ') {c = c.substring(1, c.length);}
			if (c.indexOf(nameEQ) === 0) {return decodeURIComponent(c.substring(nameEQ.length, c.length));}
		}
		return null;
	}
	static eraseCookie(name)
	{
		UI.createCookie(name, '', -1);
	}
	static getHashParams()
	{
		const empty = {};
		const {isUndefined} = Helpers;
		const reducer = (obj, str, key, val) => ([key, val] = str.split('='), isUndefined(val) ? obj : ({...obj, [key]:val}));
		const hash = window.location.hash.substr(1);
		return hash ? hash.split('&').reduce(reducer, empty) : empty;
	}
	static setHashParams(params)
	{
		const {iterable, isUndefined} = Helpers;
		const reducer = (arr, [key, val]) => isUndefined(val) ? arr : ([...arr, `${key}=${val}`]);
		const hash = iterable(params).reduce(reducer, []).join('&');
		window.location.hash = hash;
		return params;
	}
	static getElement(name)
	{
		return document.getElementById(name);
	}
	static find(node, selector)
	{
		return node.querySelector(selector);
	}
	static findAll(node, selector)
	{
		return node.querySelectorAll(selector);
	}
	static closest(node, selector)
	{
		return node.closest(selector);
	}
	static createElement(html)
	{
		const template = document.createElement('template');
		template.innerHTML = html.trim();
		return template.content.firstChild;
	}
	static empty(node)
	{
		while (node.firstChild) {node.removeChild(node.firstChild);}
		return node;
	}
	static triggerChange(node)
	{
		node.dispatchEvent(new Event('change', {bubbles:true}));
		return node;
	}
	static hasClass(node, className)
	{
		return node && node.classList.contains(className);
	}
	static toggleClass(node, classList, enable = true)
	{
		const classes = classList.split(' ');
		node && node.classList[enable ? 'add' : 'remove'](...classes);
		return node;
	}
	static toggleFlow(node, show = true)
	{
		UI.toggleClass(node, 'noflow', !show);
		return node;
	}
	static toggleVisibility(node, show = true)
	{
		UI.toggleClass(node, 'hidden', !show);
		return node;
	}
	static toggleSelected(node, select = true)
	{
		UI.toggleClass(node, 'selected', select);
		return node;
	}
	static toggleDisabled(node, disable = true)
	{
		node.disabled = disable;
		return node;
	}
	static toggleChecked(node, check = true)
	{
		node.checked = check;
		return node;
	}
	static setValue(node, value)
	{
		node.value = value;
		return node;
	}
	static setText(node, text)
	{
		node.textContent = text;
		return node;
	}
	static setHTML(node, html)
	{
		node.innerHTML = html;
		return node;
	}
	static setData(node, data)
	{
		const {assign} = Helpers;
		assign(data).to(node.dataset);
		return node;
	}
	static getData(node)
	{
		return node.dataset;
	}
	static isVisible(node)
	{
		const {notEqual} = Helpers;
		return Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length) && notEqual(window.getComputedStyle(node).visibility, 'hidden');
	}
	static append(node, parent)
	{
		parent.appendChild(node);
	}
	static remove(node)
	{
		node.parent.removeChild(node);
	}
	static focus(node, value)
	{
		value ? node.focus(value) : node.focus();
		return node;
	}
	static blur(node)
	{
		node.blur();
		return node;
	}
	static click(node)
	{
		node && node.click();
	}
	static checkButton(node, check)
	{
		UI.toggleChecked(node, check);
		UI.triggerChange(node);
		return node;
	}
	static getText(node)
	{
		return node.textContent || node.innerText;
	}
	static isChecked(node)
	{
		return node.checked;
	}
	static captureString(node)
	{
		return node.value.trim();
	}
	static captureInt(node)
	{
		return +node.value;
	}
	static captureDateTime(node)
	{
		return new Date(UI.find(node, 'input[type=date]').value+'T'+UI.find(node, 'input[type=time]').value);
	}
	static selectRow(node, id)
	{
		UI.toggleSelected(UI.find(node, '.selected'), false);
		id && UI.toggleSelected(UI.find(node, `#row${id}`), true);
		return node;
	}
	static nowrap(str)
	{
		return str.replace(' ', '&nbsp;');
	}
	static time()
	{
		return new Date(Date.now()).toLocaleString('en-US', { day:'numeric', month:'numeric', year:'numeric', hour:'numeric', minute:'numeric', hour12:true});
	}
	static download(name, content, type = 'text/plain')
	{
		const a = document.createElement('a');
		const url = URL.createObjectURL(new Blob([content], {type}));
		const destroy = () => {
			URL.revokeObjectURL(url);
			a.remove();
		};
		a.href = url;
		a.target = '_blank';
		a.download = name;
		a.onclick = () => setTimeout(destroy, 150);
		a.click();
		return a;
	}
	set Ready(response)
	{
		const {isFunction} = Helpers;
		isFunction(this._on_ready) && this._on_ready(response);
	}
	get Ready()
	{
		return new Promise(resolve => this._on_ready = resolve);
	}
	set UserResponse(response)
	{
		const {isFunction} = Helpers;
		isFunction(this._user_response) && this._user_response(response);
	}
	get UserResponse()
	{
		return new Promise(resolve => this._user_response = resolve);
	}
	set SessionID(sessionid)
	{
		this._sessionid = sessionid;
		// publish session value to websocket layer
		this.actions.setSessionID(sessionid);
	}
	get SessionID()
	{
		// if the client has a stored sessionid then prefer that over the new random hash provided by the websocket
		return UI.readCookie('sessionid') || this._sessionid;
	}
	set CurrentUser(user)
	{
		const {sessionid, loggedin, firstname, lastname, access} = this._current_user = user;
		const startSession = () => {
			// save session value in the client to establish a stateful connection
			UI.createCookie('sessionid', sessionid, 1);
			this.updateUserMenu(`${firstname} ${lastname}`);
			this.refreshAll(sessionid, access).then(this.clientNavigate);
		};
		const endSession = () => {
			// clear saved session from the client
			UI.eraseCookie('sessionid');
			this.updateUserMenu('');
			this.Screen = 'login';
		};
		// take appropriate action based on user login status
		loggedin ? startSession() : endSession();
	}
	get CurrentUser()
	{
		const defaultUser = {loggedin:false, firstname:'', lastname:'', sessionid:this.SessionID, access:{}};
		return this._current_user || defaultUser;
	}
	set Screen(selected)
	{
		const {iterable, isEqual, notEqual} = Helpers;
		this.CurrentUser.loggedin || (selected = 'login');
		const current = this.screens[selected];
		if (notEqual(this._screen, current))
		{
			for (const [name, screen] of iterable(this.screens)) {isEqual(name, selected) ? UI.focus(screen) : UI.blur(screen);}
			this._screen = current;
		}
		this.hideMenu('userMenu');
	}
	get Screen()
	{
		const {meetings, login} = this.screens;
		return this.CurrentUser.loggedin ? this._screen || meetings : login;
	}
	set LegislativeSessions(sessions)
	{
		this._legislative_sessions = sessions;
	}
	get LegislativeSessions()
	{
		return this._legislative_sessions || [];
	}
	set Reports(reports)
	{
		// populate admin screen - user listing table
		const {index, isEqual, UCFirst} = Helpers;
		this._reports = index('report_id', reports);
		let even = false;
		const rows = ['<tr><th>Report Name</th><th>Data Source</th><th>Owner</th><th>Private</th></tr>'];
		if (isEqual(reports.length, 0))
		{
			rows.push('<tr><td colspan="4">No data to display.</td></tr>')
		}
		else
		{
			for (const row of reports)
			{
				even = !even;
				const {report_id, user_id, report_name, datasource, private_report} = new Report(row);
				const selected = isEqual(report_id, this.ReportSelection) ? ' selected' : '';
				const alternate = even ? 'even' : 'odd';
				const rowClass = `${alternate}${selected}`;
				const {login_name} = this.Users[user_id];
				const html = `<tr id="row${report_id}" class="selectRow ${rowClass}" data-id="${report_id}" data-screen="admin"><td class="nowrap">${report_name}</td><td class="nowrap">${UCFirst(datasource)}</td><td>${login_name}</td><td class="${private_report ? 'darkgreen' : 'red'}">${private_report ? '&#10004;' : '&#10006;'}</td></tr>`;
				rows.push(html);
			}
		}
		UI.setHTML(this.elements.reportsTable, rows.join(''));
	}
	get Reports()
	{
		return this._reports || [];
	}
	set ReportSelection(id)
	{
		this._report_selection = id;
		const editMode = Boolean(id);
		const report = new Report(this.Reports[id]);
		const {report_name, datasource, private_report} = report;
		const {reportsTable, reportList, reportEdit} = this.elements;
		// apply selection to report listing
		UI.selectRow(reportsTable, id);
		UI.toggleDisabled(UI.find(reportList, 'button.reportEdit'), !editMode);
		UI.toggleDisabled(UI.find(reportList, 'button.deleteReport'), !editMode);
		UI.toggleDisabled(UI.find(reportList, 'button.runReport'), !editMode);
		// populate report edit window
		UI.setText(UI.find(reportEdit, '.title'), editMode ? 'Edit Existing Report' : 'Create New Report');
		UI.setValue(UI.find(reportEdit, 'input.reportName'), report_name);
		UI.setValue(UI.find(reportEdit, 'select.dataSource'), datasource);
		UI.checkButton(UI.find(reportEdit, 'input.private'), !editMode || private_report);
		const columnNode = UI.getElement('columnCriteria');
		const filterNode = UI.getElement('filterCriteria');
		const sortNode = UI.getElement('sortCriteria');
		const limitNode = UI.getElement('limitCriteria');
		this.ReportCriteria = new ReportControls(report, this.reportColumns, columnNode, filterNode, sortNode, limitNode);
	}
	get ReportSelection()
	{
		return this._report_selection || 0;
	}
	set ReportCriteria(controls)
	{
		this._report_criteria = controls;
	}
	get ReportCriteria()
	{
		return this._report_criteria || {};
	}
	set Users(users)
	{
		// populate admin screen - user listing table
		const {index, isEmpty, isEqual} = Helpers;
		isEmpty(users) || (this._users = index('user_id', users));
		let even = false;
		const rows = ['<tr><th>Username</th><th>Real&nbsp;Name</th><th>Enabled</th></tr>'];
		if (isEqual(users.length, 0))
		{
			rows.push('<tr><td colspan="3">No data to display.</td></tr>')
		}
		else
		{
			for (const row of users)
			{
				even = !even;
				const user = new User(row);
				const {user_id, login_name, first_name, last_name, enabled} = user;
				const selected = isEqual(user_id, this.UserSelection) ? ' selected' : '';
				const alternate = even ? 'even' : 'odd';
				const rowClass = `${alternate}${selected}`;
				const html = `<tr id="row${user_id}" class="selectRow ${rowClass}" data-id="${user_id}" data-screen="admin"><td class="nowrap">${login_name}</td><td>${first_name} ${last_name}</td><td class="${enabled ? 'darkgreen' : 'red'}">${enabled ? '&#10004;' : '&#10006;'}</td></tr>`;
				rows.push(html);
			}
		}
		UI.setHTML(this.elements.usersTable, rows.join(''));
	}
	get Users()
	{
		return this._users || [];
	}
	set UserSelection(id)
	{
		this._user_selection = id;
		const editMode = Boolean(id);
		const user = new User(this.Users[id]);
		const {first_name, last_name, login_name, senate_committee, house_committee, user_group, system_admin, enabled} = user;
		const {usersTable, userList, userEdit} = this.elements;
		// apply selection to user listing
		UI.selectRow(usersTable, id);
		UI.toggleDisabled(UI.find(userList, 'button.userEdit'), !editMode);
		UI.toggleDisabled(UI.find(userList, 'button.deleteUser'), !editMode);
		// populate user edit window
		UI.setText(UI.find(userEdit, '.title'), editMode ? 'Edit Existing User' : 'Create New User');
		UI.setValue(UI.find(userEdit, 'input.firstName'), first_name);
		UI.setValue(UI.find(userEdit, 'input.lastName'), last_name);
		UI.setValue(UI.find(userEdit, 'input.loginName'), login_name);
		UI.toggleFlow(UI.find(userEdit, 'p.userNote'), !editMode);
		UI.setValue(UI.find(userEdit, 'input.password1'), editMode ? this._randomString : '');
		UI.setValue(UI.find(userEdit, 'input.password2'), editMode ? this._randomString : '');
		UI.setValue(UI.find(userEdit, 'select.senateCommittee'), senate_committee);
		UI.setValue(UI.find(userEdit, 'select.houseCommittee'), house_committee);
		UI.setValue(UI.find(userEdit, 'select.group'), user_group);
		UI.checkButton(UI.find(userEdit, 'input.admin'), system_admin);
		UI.checkButton(UI.find(userEdit, 'input.enabled'), !editMode || enabled);
	}
	get UserSelection()
	{
		return this._user_selection || 0;
	}
	set Groups(groups)
	{
		// populate admin screen - group listing table
		const {index, isEmpty, isEqual} = Helpers;
		isEmpty(groups) || (this._groups = index('group_id', groups));
		let even = false, menu = ['<option value="0">Select...</option>'];
		const rows = ['<tr><th>Group</th><th>Permissions</th><th>Enabled</th></tr>'];
		if (isEqual(groups.length, 0))
		{
			rows.push('<tr><td colspan="3">No data to display.</td></tr>')
		}
		else
		{
			for (const row of groups)
			{
				even = !even;
				const group = new Group(row);
				const {group_id, group_name, group_permissions, enabled} = group;
				const selected = isEqual(group_id, this.GroupSelection) ? ' selected' : '';
				const alternate = even ? 'even' : 'odd';
				const rowClass = `${alternate}${selected}`;
				const html = `<tr id="row${group_id}" class="selectRow ${rowClass}" data-id="${group_id}" data-screen="admin"><td class="nowrap">${group_name}</td><td class="left" width="100%">${group_permissions.join(', ')}</td><td>${enabled ? '&#10004;' : '&#10006;'}</td></tr>`;
				rows.push(html);
				group_id > 2 && enabled && menu.push(`<option value="${group_id}">${group_name}</option>`);
			}
		}
		UI.setHTML(this.elements.groupsTable, rows.join(''));
		// populate admin screen - user edit window
		UI.setHTML(UI.find(this.elements.userEdit, '.group'), menu.join(''));
	}
	get Groups()
	{
		return this._groups || {};
	}
	set GroupSelection(id)
	{
		this._group_selection = id;
		const editMode = Boolean(id);
		const group = new Group(this.Groups[id]);
		const {group_name, group_permissions, enabled} = group;
		const {groupsTable, groupList, groupEdit} = this.elements;
		// apply selection to group listing
		UI.selectRow(groupsTable, id);
		UI.toggleDisabled(UI.find(groupList, 'button.groupClone'), !editMode);
		UI.toggleDisabled(UI.find(groupList, 'button.groupEdit'), !editMode);
		UI.toggleDisabled(UI.find(groupList, 'button.deleteGroup'), !editMode);
		// populate group edit window
		UI.setText(UI.find(groupEdit, '.title'), editMode ? 'Edit Existing Group' : 'Create New Group');
		UI.setValue(UI.find(groupEdit, '.groupName'), group_name);
		UI.findAll(groupEdit, 'input[type=checkbox]').forEach(checkbox => UI.checkButton(checkbox, false));
		UI.checkButton(UI.find(groupEdit, 'input.enabled'), enabled);
		group_permissions.forEach(permission => UI.checkButton(UI.find(groupEdit, '.'+permission), true));
	}
	get GroupSelection()
	{
		return this._group_selection || 0;
	}
	set Committees(committees)
	{
		// populate meeting edit window
		const {index, isEqual, isUndefined} = Helpers;
		if (!isUndefined(committees))
		{
			const {meetingEdit, meetingList, userEdit, committeesTable} = this.elements;
			const chambers = {
				S:'Senate',
				H:'House'
			};
			this._committees = index('committee_id', committees);
			const rows = ['<tr><th>Committee&nbsp;Name</th></tr>'];
			if (isEqual(committees.length, 0))
			{
				rows.push('<tr><td>No data to display.</td></tr>')
			}
			else
			{
				const senateCommittees = [];
				const houseCommittees = [];
				for (const {committee_id, committee_name, committee_chamber} of committees)
				{
					if (isUndefined(committee_id)) {throw new Error('bad committee');}
					const option = `<option value="${committee_id}">${chambers[committee_chamber]} ${committee_name}</option>`;
					if (isEqual(committee_chamber, 'S')) {senateCommittees.push(option);}
					else if (isEqual(committee_chamber, 'H')) {houseCommittees.push(option);}
				}
				const senateMenu = [defaultOption, ...senateCommittees].join('');
				const houseMenu = [defaultOption, ...houseCommittees].join('');
				UI.setHTML(UI.find(meetingEdit, 'select.senateCommittee'), senateMenu);
				UI.setHTML(UI.find(meetingEdit, 'select.houseCommittee'), houseMenu);
				// populate meeting list window
				const allMenu = [...senateCommittees, ...houseCommittees];
				const filterMenu = UI.find(meetingList, 'select.filterCommittee');
				(allMenu.length > 1) ? allMenu.unshift('<option value="0">Filter by Committee</option>') : UI.toggleFlow(filterMenu, false);
				UI.setHTML(filterMenu, allMenu.join(''));
				// populate admin screen - user edit window
				UI.setHTML(UI.find(userEdit, 'select.senateCommittee'), senateMenu);
				UI.setHTML(UI.find(userEdit, 'select.houseCommittee'), houseMenu);
				// populate admin screen - committee listing table
				let even = false;
				for (const {committee_id, committee_name, committee_chamber} of committees)
				{
					even = !even;
					const selected = isEqual(committee_id, this.CommitteeSelection) ? ' selected' : '';
					const alternate = even ? 'even' : 'odd';
					const rowClass = `${alternate}${selected}`;
					const html = `<tr id="row${committee_id}" class="selectRow ${rowClass}" data-id="${committee_id}" data-screen="admin"><td class="left">${chambers[committee_chamber]} ${committee_name}</td></tr>`;
					rows.push(html);
				}
			}
			// populate admin screen - user edit window
			UI.setHTML(committeesTable, rows.join(''));
		}
	}
	get Committees()
	{
		return this._committees || [];
	}
	set CommitteeSelection(id)
	{
		const {committeesTable, committeeList, committeeEdit} = this.elements;
		this._committee_selection = id;
		const editMode = Boolean(id);
		const committee = new Committee(this.Committees[id]);
		const {committee_name, committee_chamber} = committee;
		// apply selection to committee listing
		UI.selectRow(committeesTable, id);
		UI.toggleDisabled(UI.find(committeeList, 'button.committeeEdit'), !editMode);
		UI.toggleDisabled(UI.find(committeeList, 'button.deleteCommittee'), !editMode);
		// populate committee edit window
		UI.setText(UI.find(committeeEdit, '.title'), editMode ? 'Edit Existing Committee' : 'Create New Committee');
		UI.setValue(UI.find(committeeEdit, 'input.committeeName'), committee_name);
		UI.setValue(UI.find(committeeEdit, 'select.committeeChamber'), committee_chamber);
	}
	get CommitteeSelection()
	{
		return this._committee_selection || 0;
	}
	set Settings(settings)
	{
		// populate admin screen - setting listing table
		const {index, isEmpty, isEqual} = Helpers;
		isEmpty(settings) || (this._settings = index('setting_id', settings));
		const {settingsTable} = this.elements;
		let even = false;
		const rows = ['<tr><th>Setting&nbsp;Name</th><th>Setting&nbsp;Value</th></tr>'];
		if (isEqual(settings.length, 0))
		{
			rows.push('<tr><td colspan="2">No data to display.</td></tr>')
		}
		else
		{
			for (const row of settings)
			{
				even = !even;
				const setting = new Setting(row);
				const {setting_id, setting_name, setting_value} = setting;
				const alternate = even ? 'even' : 'odd';
				const rowClass = `${alternate}`;
				const html = `<tr id="row${setting_id}" class="selectRow ${rowClass}" data-id="${setting_id}" data-screen="admin"><td class="nowrap">${setting_name}</td><td class="nowrap">${setting_value}</td></tr>`;
				rows.push(html);
			}
		}
		UI.setHTML(settingsTable, rows.join(''));
	}
	get Settings()
	{
		return this._settings || [];
	}
	set SettingSelection(id)
	{
		this._setting_selection = id;
		const {settingsTable, settingList, settingEdit} = this.elements;
		const editMode = Boolean(id);
		const setting = new Setting(this.Settings[id]);
		const {setting_name, setting_value} = setting;
		// apply selection to setting listing
		UI.selectRow(settingsTable, id);
		UI.toggleDisabled(UI.find(settingList, 'button.settingEdit'), !editMode);
		UI.toggleDisabled(UI.find(settingList, 'button.deleteSetting'), !editMode);
		// populate selection edit page
		UI.setText(UI.find(settingEdit, '.title'), editMode ? 'Edit Existing Setting' : 'Create New Setting');
		UI.setValue(UI.find(settingEdit, 'input.settingName'), setting_name);
		UI.setValue(UI.find(settingEdit, 'input.settingValue'), setting_value);
	}
	get SettingSelection()
	{
		return this._setting_selection || 0;
	}
	set Attachments(attachments)
	{
		const {index, isEmpty} = Helpers;
		if (!isEmpty(attachments))
		{
			this._attachments = index('file_id', attachments);
			this.AttachmentSelection = this.AttachmentSelection;
		}
	}
	get Attachments()
	{
		return this._attachments || [];
	}
	set AttachmentSelection(id)
	{
		this._attachment_selection = id;
		const {round} = Helpers;
		const {meetingEdit} = this.elements;
		const details = UI.find(meetingEdit, '.fileDetails');
		const format = (size, magnitude = 1) => {
			const scalar = ['B', 'KB', 'MB', 'GB', 'TB'];
			const newSize = size/1000.0;
			return newSize < 1 ? `${round(size, 100)}${scalar[magnitude]}` : format(newSize, magnitude++);
		};
		const file = this.Attachments[id] || null;
		if (file)
		{
			const {filename, filesize} = file;
			const html = `<a href="${REPOSITORY}${filename}" target="_blank">Preview Current Attachment</a> (${format(filesize)})`;
			UI.toggleFlow(UI.setHTML(details, html), true);
		}
		else {UI.toggleFlow(details, false);}
	}
	get AttachmentSelection()
	{
		return this._attachment_selection || 0;
	}
	set Meetings(meetings)
	{
		// populate meetings screen - meeting listing table
		const {index, isEmpty, isEqual, today, future} = Helpers;
		const {meetingsTable, meetingsTableMobile} = this.elements;
		isEmpty(meetings) || (this._meetings = index('meeting_id', meetings));
		const chambers = {
			0:'-',
			S:'Senate',
			H:'House',
			J:'Joint'
		};
		const videotypes = {
			L:'Stream',
			A:'Draft',
			I:'Offsite',
			R:'Requested'
		};
		const abbreviate = name => {
			const exceptions = [
				{search:'Agriculture, Natural Resources, and Environmental Affairs', replace:'Agriculture'},
				{search:'Agriculture and Natural Resources', replace:'Agriculture'},
				{search:'Education and Public Works', replace:'E.P.W.'},
				{search:'Labor, Commerce and Industry', replace:'L.C.I.'},
				{search:'Medical, Military, Public, and Municipal Affairs', replace:'3-M'},
				{search:'Fish, Game and Forestry', replace:'Forestry'},
				{search:"Family and Veterans' Services", replace:"Veterans' Services"}
			];
			const maxLength = 30;
			if (name.length < maxLength) {return name;}
			for (const {search, replace} of exceptions) {if (name.includes(search)) {return name.replace(search, replace);}}
			const segments = name.split(' ');
			let aggregate = '';
			for (const segment of segments)
			{
				const length = aggregate.length + segment.length;
				if (length < maxLength) {aggregate += ' ' + segment;}
			}
			if (aggregate.endsWith(' and')) {aggregate = aggregate.slice(0, aggregate.length-4);}
			return `${aggregate}...`;
		};
		const committees = id => {
			const {includes} = Helpers;
			if (includes(id).in(this.Committees))
			{
				const {committee_chamber, committee_name} = this.Committees[id];
				return `${chambers[committee_chamber]} ${committee_name}`;
			}
			return null;
		};
		let even = false;
		const rows = ['<tr><th>ID</th><th>Meeting&nbsp;Time</th><th>Meeting&nbsp;Title</th><th>Location</th><th>Chamber</th><th>Committee</th><th>Type</th><th>Status</th></tr>'];
		const rowsMobile = ['<tr><th>Meeting</th></tr>'];
		let prevFuture = true;
		for (const row of meetings)
		{
			even = !even;
			const meeting = new Meeting(row);
			const {canceled, internal, chamber, committeename, displaytime, location, meeting_id, meetingtime, publishtime, total_duration, video_type, senate_committee, house_committee} = meeting;
			const selected = isEqual(meeting_id, this.MeetingSelection) ? ' selected' : '';
			const Chamber = chambers[chamber];
			const presentMeeting = today(meetingtime);
			const futureMeeting = future(meetingtime);
			const futurePublish = future(publishtime);
			const meetingStatus = futurePublish ? 'Unpublished' : futureMeeting ? 'Pending' : presentMeeting ? 'Progressing' : 'Closed';
			const videotype = videotypes[video_type] || '';
			const videoStatus = (!isEmpty(total_duration) && isEqual(video_type, 'A')) ? 'Archived' : isEqual(video_type, 'N') ? meetingStatus : videotype || meetingStatus;
			const statusClass = canceled ? 'Canceled' : videoStatus;
			const status = isEqual(statusClass, 'Archived') ? `Archived<br>${total_duration}` : statusClass;
			const type = internal ? 'Internal' : 'Public';
			const committee = [committees(senate_committee), committees(house_committee)].filter(Boolean).join('<br>');
			const alternate = even ? 'even' : 'odd';
			const futureClass = prevFuture && !futureMeeting ? ' nowDivider' : '';
			prevFuture = futureMeeting;
			const rowClass = `${alternate}${futureClass}${selected}`;
			const displayTime = this.formatDateTime(meetingtime) + (displaytime ? `<br>(${displaytime})` : '');
			const html = `<tr id="row${meeting_id}" class="selectRow ${rowClass}" data-id="${meeting_id}" data-screen="meetings"><td>${meeting_id}</td><td class="nowrap">${displayTime}</td><td>${committeename}</td><td class="nowrap">${location}</td><td>${Chamber}</td><td>${committee || '-'}</td><td>${type}</td><td class="${statusClass} nowrap">${status}</td></tr>`;
			const top = `<div class="flex-container flex-content-space-between"><span class="flex-item bold nowrap">${isEqual(Chamber, 'Joint') ? 'Joint' : abbreviate(committee) || Chamber}</span><span style="flex-grow: 4;"></span><span class="flex-item borderBlack radiusSmall padSmall small ${statusClass} nowrap">${status}</span></div>`;
			const content = `<div class="flex-container left">${displayTime}<br>${committeename}<br>${location}</div>`;
			const htmlMobile = `<tr id="row${meeting_id}" class="selectRow ${rowClass}" data-id="${meeting_id}" data-screen="meetings"><td><div class="flex-container flex-column">${top}${content}</div></td></tr>`;
			rows.push(html);
			rowsMobile.push(htmlMobile);
		}
		if (isEqual(rows.length, 1))
		{
			rows.push('<tr><td colspan="8">No meetings match current filter.</td></tr>');
			rowsMobile.push('<tr><td>No meetings match current filter.</td></tr>');
		}
		UI.setHTML(meetingsTable, rows.join(''));
		UI.setHTML(meetingsTableMobile, rowsMobile.join(''));
	}
	get Meetings()
	{
		return this._meetings || [];
	}
	set MeetingFilter({column, search})
	{
		const {isEmpty, isEqual, assign} = Helpers;
		const {sessionid, access, loggedin} = this.CurrentUser;
		if (isEqual(column, 'title'))
		{
			const currentsearch = this.MeetingFilter;
			delete currentsearch.committeename;
			this._meeting_search = isEmpty(search) ? currentsearch : assign(currentsearch).to({committeename:{operator:'LIKE', val:`%${search}%`}});
		}
		else if (isEqual(column, 'committee'))
		{
			const currentsearch = this.MeetingFilter;
			delete currentsearch.house_committee;
			delete currentsearch.senate_committee;
			if (search > 0)
			{
				const {chamber} = this.Committees[search];
				const key = isEqual(chamber, 'S') ? 'senate_committee' : 'house_committee';
				this._meeting_search = assign(currentsearch).to({[key]:{operator:'=', val:search}});
			}
			else {this._meeting_search = currentsearch;}
		}
		loggedin && this.refreshMeetings(sessionid, access);
	}
	get MeetingFilter()
	{
		return this._meeting_search || {};
	}
	set MeetingSelection(id = 0)
	{
		const {isEqual, UTCtoLocalDate, UTCtoLocalTime} = Helpers;
		let publish = true;
		let node;
		this._meeting_selection = id;
		const editMode = Boolean(id);
		const meeting = new Meeting(this.Meetings[id]);
		if (!editMode)
		{
			// provide sane starting values for dates and times
			const today = new Date().setHours(0);
			const preferred = new Date().setHours(8, 0);
			const min = new Date().setSeconds(0);
			for (const key of ['publishtime', 'meetingtime'])
			{
				const value = meeting[key];
					const moment = value ? (new Date(value)).setSeconds(0) : (new Date()).setSeconds(0);
					meeting[key] = moment < today
						? preferred < min
							? min
							: preferred
						: moment;
			}
		}
		const {chamber, publishtime, meetingtime, displaytime, committeename, bill_list, special_requests, phone, location, canceled, internal, video_type, senate_committee, house_committee, agendalink} = meeting;
		const {meetingsTable, meetingsTableMobile, meetingList, meetingEdit} = this.elements;
		// apply selection to meeting listing
		UI.selectRow(meetingsTable, id);
		UI.selectRow(meetingsTableMobile, id);
		UI.toggleDisabled(UI.find(meetingList, 'button.meetingClone'), !editMode);
		UI.toggleDisabled(UI.find(meetingList, 'button.meetingEdit'), !editMode);
		UI.toggleDisabled(UI.find(meetingList, 'button.cancelMeeting'), !editMode || canceled);
		UI.toggleDisabled(UI.find(meetingList, 'button.deleteMeeting'), !editMode);
		// populate meeting edit page
		UI.setText(UI.find(meetingEdit, '.title'), editMode ? 'Edit Existing Meeting' : 'Create New Meeting');
		UI.checkButton(UI.find(meetingEdit, '.public'), !internal);
		UI.checkButton(UI.find(meetingEdit, '.broadcast'), isEqual(video_type, 'R') || isEqual(video_type, 'L'));
		UI.checkButton(UI.find(meetingEdit, '.customTime'), displaytime);
		UI.toggleFlow(UI.find(meetingEdit, 'span.houseCommittee'), isEqual(chamber, 'J') || isEqual(chamber, 'H'));
		UI.toggleFlow(UI.find(meetingEdit, 'span.senateCommittee'), isEqual(chamber, 'J') || isEqual(chamber, 'S'));
		UI.setValue(UI.find(meetingEdit, 'select.selectChamber'), chamber);
		UI.setValue(UI.find(meetingEdit, 'select.senateCommittee'), senate_committee);
		UI.setValue(UI.find(meetingEdit, 'select.houseCommittee'), house_committee);
		UI.setValue(UI.find(meetingEdit, 'input.location'), location);
		UI.setValue(UI.find(meetingEdit, 'input.committeeName'), committeename);
		UI.setValue(UI.find(meetingEdit, 'input.billList'), bill_list);
		UI.setValue(UI.find(meetingEdit, 'textarea.specialRequests'), special_requests);
		// do not prefill notation field with an existing value
		UI.setValue(UI.find(meetingEdit, 'input.notation'), '');
		UI.setValue(UI.find(meetingEdit, 'input.contact'), phone);
		UI.setValue(UI.find(UI.find(meetingEdit, '#customTime'), 'input.displaytime'), displaytime)
		// do not start with a custom time if editing a new meeting
		editMode || UI.checkButton(UI.find(meetingEdit, '.customTime'), false);
		node = UI.find(meetingEdit, '.canceled');
		UI.toggleDisabled(node.parentNode, !editMode);
		UI.checkButton(node, editMode ? canceled : false);
		node = UI.find(meetingEdit, '.publishNow');
		UI.toggleDisabled(node.parentNode, editMode);
		UI.checkButton(node, publish);
		node = UI.find(meetingEdit, '#publishTime');
		UI.toggleFlow(node, !editMode);
		UI.setValue(UI.find(node, 'input[type=date]'), UTCtoLocalDate(publishtime));
		UI.setValue(UI.find(node, 'input[type=time]'), UTCtoLocalTime(publishtime));
		node = UI.find(meetingEdit, '#fixedTime');
		UI.setValue(UI.find(node, 'input[type=date]'), UTCtoLocalDate(meetingtime));
		UI.setValue(UI.find(node, 'input[type=time]'), UTCtoLocalTime(meetingtime));
		UI.setHTML(UI.find(meetingEdit, 'label#attachButton>span'), agendalink ? 'Replace Attachment' : 'Browse For Attachment');
		this.AttachmentSelection = agendalink;
	}
	get MeetingSelection()
	{
		return this._meeting_selection || 0;
	}
	async recallSession(sessionid)
	{
		// this is the first method called after establishing a connection to the backend
		const {recallSession} = this.actions;
		return this.CurrentUser = await recallSession({sessionid});
	}
	updateUserMenu(content)
	{
		UI.setText(UI.find(document, '#userMenu .userName'), content);
	}
	extractSetting(search)
	{
		const {isEqual, iterable, VALUES} = Helpers;
		for (const {setting_name, setting_value} of iterable(this.Settings, VALUES)) {if (isEqual(setting_name, search)) {return setting_value;}}
		return null;
	}
	captureMeetingValues()
	{
		const {notEqual} = Helpers;
		const {meetingEdit} = this.elements;
		const sess_number = this.extractSetting('sess_number');
		const internal = !UI.isChecked(UI.find(meetingEdit, '.public'));
		const video_type = UI.isChecked(UI.find(meetingEdit, '.broadcast')) ? 'R' : 'N';
		const canceled = UI.isChecked(UI.find(meetingEdit, '.canceled'));
		const publishNow = UI.isChecked(UI.find(meetingEdit, '.publishNow'));
		const customtime = UI.isChecked(UI.find(meetingEdit, '.customTime'));
		const previoustime = UI.captureDateTime(UI.find(meetingEdit, '#publishTime'));
		const publishtime = publishNow ? new Date().setSeconds(0) : previoustime;
		const meetingtime = UI.captureDateTime(UI.find(meetingEdit, '#fixedTime'));
		const displaytime = customtime ? UI.captureString(UI.find(UI.find(meetingEdit, '#customTime'), 'input.displaytime')) : null;
		const chamber = UI.captureString(UI.find(meetingEdit, 'select.selectChamber'));
		const senate_committee = (notEqual(chamber, '0') && UI.captureInt(UI.find(meetingEdit, 'select.senateCommittee'))) || null;
		const house_committee = (notEqual(chamber, '0') && UI.captureInt(UI.find(meetingEdit, 'select.houseCommittee'))) || null;
		const location = UI.captureString(UI.find(meetingEdit, 'input.location'));
		const committeename = UI.captureString(UI.find(meetingEdit, 'input.committeeName'));
		const bill_list = UI.captureString(UI.find(meetingEdit, 'input.billList'));
		const special_requests = UI.captureString(UI.find(meetingEdit, 'textarea.specialRequests'));
		const notation = UI.captureString(UI.find(meetingEdit, 'input.notation'));
		const phone = UI.captureString(UI.find(meetingEdit, 'input.contact'));
		const agendalink = this.AttachmentSelection || null;
		return {sess_number, chamber, publishtime, meetingtime, displaytime, committeename, bill_list, special_requests, notation, phone, location, canceled, internal, video_type, senate_committee, house_committee, agendalink};
	}
	captureUserValues()
	{
		const {userEdit} = this.elements;
		const first_name = UI.captureString(UI.find(userEdit, 'input.firstName'));
		const last_name = UI.captureString(UI.find(userEdit, 'input.lastName'));
		const login_name = UI.captureString(UI.find(userEdit, 'input.loginName'));
		let password = UI.captureString(UI.find(userEdit, 'input.password1'));
		let confirm = UI.captureString(UI.find(userEdit, 'input.password2'));
		const senate_committee = UI.captureInt(UI.find(userEdit, 'select.senateCommittee')) || null;
		const house_committee = UI.captureInt(UI.find(userEdit, 'select.houseCommittee')) || null;
		const user_group = UI.captureInt(UI.find(userEdit, 'select.group')) || null;
		const system_admin = UI.isChecked(UI.find(userEdit, '.admin'));
		const enabled = UI.isChecked(UI.find(userEdit, '.enabled'));
		return {first_name, last_name, login_name, password, confirm, senate_committee, house_committee, user_group, system_admin, enabled};
	}
	captureGroupValues()
	{
		const {notEqual} = Helpers;
		const {groupEdit} = this.elements;
		const group_name = UI.captureString(UI.find(groupEdit, 'input.groupName'));
		const enabled = UI.isChecked(UI.find(groupEdit, 'input.enabled'));
		const transform = checkbox => notEqual(checkbox.className, 'enabled') && UI.isChecked(checkbox) && checkbox.className;
		const inputs = Array.from(UI.findAll(groupEdit, 'input[type=checkbox]'));
		const group_permissions = inputs.map(transform).filter(Boolean);
		return {group_name, group_permissions, enabled};
	}
	captureCommitteeValues()
	{
		const {committeeEdit} = this.elements;
		const committee_name = UI.captureString(UI.find(committeeEdit, 'input.committeeName'));
		const committee_chamber = UI.captureString(UI.find(committeeEdit, 'select.committeeChamber'));
		return {committee_name, committee_chamber};
	}
	captureSettingValues()
	{
		const {settingEdit} = this.elements;
		const setting_name = UI.captureString(UI.find(settingEdit, 'input.settingName'));
		const setting_value = UI.captureString(UI.find(settingEdit, 'input.settingValue'));
		return {setting_name, setting_value};
	}
	captureReportValues()
	{
		const {reportEdit} = this.elements;
		const report_name = UI.captureString(UI.find(reportEdit, 'input.reportName'));
		const datasource = UI.captureString(UI.find(reportEdit, 'select.dataSource'));
		const private_report = UI.isChecked(UI.find(reportEdit, '.private'));
		return {report_name, datasource, private_report, ...this.ReportCriteria.value};
	}
	formatDateTime(moment, showToday = true, showWeekday = true)
	{
		const {today} = Helpers;
		const dateFmt = showWeekday ? {weekday:'long', year:'numeric', month:'long', day:'numeric'} : {year:'numeric', month:'long', day:'numeric'};
		const timeFmt = {hour:'numeric', minute:'numeric'};
		const isToday = today(moment);
		const date = showToday && isToday ? 'Today' : new Intl.DateTimeFormat('en-US', dateFmt).format(moment);
		const time = new Intl.DateTimeFormat('en-US', timeFmt).format(moment);
		return `${UI.nowrap(date)} ${UI.nowrap(`at ${time}`)}`;
	}
	displayClock()
	{
		const e_dateTime = UI.getElement('date-time');
		const tick = () => UI.setHTML(e_dateTime, UI.time().replace(',', '<br>'));
		tick();
		return setInterval(tick, 1000);
	}
	hideMenu(menu)
	{
		this.menus[menu].visible = false;
	}
	lockRecord(table, key_value, lock = true)
	{
		const tables = {
			users:{table_name:'users', primary_key:'user_id', key_value},
			groups:{table_name:'user_groups', primary_key:'group_id', key_value},
			committees:{table_name:'committees', primary_key:'committee_id', key_value},
			settings:{table_name:'settings', primary_key:'setting_id', key_value},
			meetings:{table_name:'meetings', primary_key:'meeting_id', key_value},
			reports:{table_name:'reports', primary_key:'report_id', key_value},
		};
		const {reject} = Helpers;
		const {sessionid} = this.CurrentUser;
		const {lockRecord, unlockRecord} = this.actions;
		const method = lock ? lockRecord : unlockRecord;
		const values = tables[table];
		if (values) {return method({sessionid, values});}
		return reject(`invalid table: ${table}`);
	}
	updateMeetingFilter()
	{
		const {meetingList} = this.elements;
		this.MeetingFilter = ({column:'title', search:UI.captureString(UI.find(meetingList, 'input.filterTitle'))});
		this.MeetingFilter = ({column:'committee', search:UI.captureInt(UI.find(meetingList, 'select.filterCommittee'))});
	}
	clearMeetingFilter()
	{
		const {meetingList} = this.elements;
		UI.setValue(UI.find(meetingList, 'input.filterTitle'), '');
		UI.setValue(UI.find(meetingList, 'select.filterCommittee'), 0);
		this.updateMeetingFilter();
	}
	refreshAttachments(sessionid)
	{
		const saveAttachments = attachments => this.Attachments = attachments;
		return this.actions.getAttachments({sessionid}).then(saveAttachments);
	}
	refreshMeetings(sessionid, access)
	{
		const {assign, min, parseInt, iterable, KEYS} = Helpers;
		const val = min(...iterable(access, KEYS).map(parseInt)), operator = '=';
		const criteria = {committee_id:{operator, val}};
		assign(this.MeetingFilter).to(criteria);
		const getMeetings = () => this.actions.getMeetings({sessionid, criteria});
		const saveMeetings = meetings => this.Meetings = meetings;
		return this.refreshAttachments(sessionid).then(getMeetings).then(saveMeetings);
	}
	refreshReports(sessionid)
	{
		const saveReports = reports => this.Reports = reports;
		return this.actions.getReports({sessionid}).then(saveReports);
	}
	refreshUsers(sessionid)
	{
		const saveUsers = users => this.Users = users;
		return this.actions.getUsers({sessionid}).then(saveUsers);
	}
	refreshGroups(sessionid)
	{
		const saveGroups = groups => this.Groups = groups;
		const refreshUsers = () => this.refreshUsers(sessionid);
		return this.actions.getGroups({sessionid}).then(saveGroups).then(refreshUsers);
	}
	refreshCommittees(sessionid, access)
	{
		const saveCommittees = committees => this.Committees = committees;
		const refreshMeetings = () => this.refreshMeetings(sessionid, access);
		return this.actions.getCommittees({sessionid}).then(saveCommittees).then(refreshMeetings);
	}
	refreshSettings(sessionid)
	{
		const saveSettings = settings => this.Settings = settings;
		return this.actions.getSettings({sessionid}).then(saveSettings);
	}
	refreshLegislativeSessions(sessionid)
	{
		const saveSessions = sessions => this.LegislativeSessions = sessions;
		return this.actions.getLegislativeSessions({sessionid}).then(saveSessions);
	}
	checkSession(sessionid, loggedin)
	{
		// make certain the user has not been logged out of the database due to inactivity
		const checkActivity = ({loggedin}) => {
			if (!loggedin)
			{
				console.log('Logged out due to inactivity.');
				this.actions.disconnectSocket();
			}
		};
		loggedin && this.recallSession(sessionid).then(checkActivity);
	}
	refreshAll(sessionid, access)
	{
		this.updateMeetingFilter();
		const refreshCommittees = () => this.refreshCommittees(sessionid, access);
		const refreshLegislativeSessions = () => this.refreshLegislativeSessions(sessionid);
		const refreshGroups = () => this.refreshGroups(sessionid);
		const refreshSettings = () => this.refreshSettings(sessionid);
		const refreshReports =() => this.refreshReports(sessionid);
		return refreshCommittees().then(refreshLegislativeSessions).then(refreshGroups).then(refreshSettings).then(refreshReports).catch(console.error);
	}
	status(status)
	{
		// this method is periodically triggered by status push messages from the backend
		const {sessionid, loggedin, access} = this.CurrentUser;
		if (loggedin)
		{
			const {iterable, VALUES} = Helpers;
			for (const table of iterable(status, VALUES))
			{
				switch(table)
				{
					case 'meetings': {return this.refreshMeetings(sessionid, access);}
					case 'users': {return this.refreshUsers(sessionid);}
					case 'user_groups': {return this.refreshGroups(sessionid);}
					case 'committees': {return this.refreshCommittees(sessionid, access);}
					case 'settings': {return this.refreshSettings(sessionid);}
					case 'reports': {return this.refreshReports(sessionid);}
					case 'sessions': {return this.checkSession(sessionid, loggedin);}
				}
			}
		}
	}
	connection(up, message)
	{
		this.isConnected = up;
		const status = UI.getElement('connection');
		const {red, green, flash} = this.classes;
		UI.toggleClass(status, `${red} ${flash}`, !up);
		UI.toggleClass(status, green, up);
		UI.setHTML(UI.find(status, 'span.info'), message);
	}
	up(actions)
	{
		// this method is triggered during the client/server handshake phase when the server side is ready
		const {assign} = Helpers;
		// import backend methods and make them available to frontend function calls
		assign(actions).to(this.actions);
		// sync websocket layer with nonvolatile sessionid in client (handles user navigation and refresh cases)
		const saveSession = ({sessionid, loggedin}) => loggedin && (this.SessionID = sessionid);
		this.Ready = this.recallSession(this.SessionID).then(saveSession);
	}
	online(sessionid)
	{
		// get default sessionid from websocket
		this._sessionid = sessionid;
		this.connection(true, 'Connection Quality is Good');
	}
	offline()
	{
		this.busy();
		this.Screen = 'loading';
		this.connection(false, 'Server Connection is Down');
	}
	async exception(event)
	{
		// this method is triggered by the backend to report underlying issues
		console.error(event);
	}
	constructor()
	{
		const {apply, tee, isObject, isFunction, isEqual, notEqual, isNull, isEmpty, isNumber, includes, today, past, iterable, KEYS, VALUES} = Helpers;
		const {getElement, find, focus, setText, setValue, hasClass, toggleClass, toggleFlow, toggleVisibility, toggleDisabled, triggerChange, captureString, closest, getHashParams} = UI;
		this._randomString = '&RANDOMSTRING&';
		this.classes = {
			red:'red',
			green:'green',
			flash:'flash'
		};
		// main UI element lookup table (cached for speed and maintainablility)
		this.elements = {
			home:getElement('home'),
			admin:getElement('admin'),
			meetings:getElement('meetings'),
			loginDialog:getElement('login'),
			alertDialog:getElement('alert'),
			confirmDialog:getElement('confirm'),
			passwordDialog:getElement('passwordDialog'),
			addCriteriaDialog:getElement('addCriteriaDialog'),
			userList:getElement('userList'),
			userEdit:getElement('userEdit'),
			usersTable:getElement('usersTable'),
			groupList:getElement('groupList'),
			groupEdit:getElement('groupEdit'),
			groupsTable:getElement('groupsTable'),
			committeeList:getElement('committeeList'),
			committeeEdit:getElement('committeeEdit'),
			committeesTable:getElement('committeesTable'),
			settingList:getElement('settingList'),
			settingEdit:getElement('settingEdit'),
			settingsTable:getElement('settingsTable'),
			reportList:getElement('reportList'),
			reportEdit:getElement('reportEdit'),
			reportsTable:getElement('reportsTable'),
			reportView:getElement('reportView'),
			meetingList:getElement('meetingList'),
			meetingEdit:getElement('meetingEdit'),
			meetingsTable:getElement('meetingsTable'),
			meetingsTableMobile:getElement('meetingsTableMobile')
		};
		// methods used to capture data for report generation
		this.reportColumns = {
			getSessions:() => this.LegislativeSessions,
			getCommittees:chamber => iterable(this.Committees, VALUES).filter(({committee_chamber}) => isEqual(committee_chamber, chamber)).reduce((committees, {committee_id, committee_name}) => ({...committees, [committee_id]:committee_name}), {})
		};
		const {meetingList, meetingEdit} = this.elements;
		// handle admin tabs
		const adminModes = path => {
			const {panel, mode, id} = path;
			const {home, userList, userEdit, groupList, groupEdit, committeeList, committeeEdit, settingList, settingEdit, reportList, reportEdit} = this.elements;
			const setID = isNumber(id);
			const newMode = isEqual(mode, 'add');
			const cloneMode = isEqual(mode, 'clone');
			const editMode = isEqual(mode, 'edit') || cloneMode || newMode;
			const listMode = isEqual(mode, 'list');
			const panels = {
				home:async () => {
					toggleFlow(home, true);
					toggleFlow(userList, false);
					toggleFlow(userEdit, false);
					toggleFlow(groupList, false);
					toggleFlow(groupEdit, false);
					toggleFlow(committeeList, false);
					toggleFlow(committeeEdit, false);
					toggleFlow(settingList, false);
					toggleFlow(settingEdit, false);
					toggleFlow(reportList, false);
					toggleFlow(reportEdit, false);
					toggleFlow(reportView, false);
				},
				users:async () => {
					if (setID) {this.UserSelection = id;}
					toggleFlow(home, false);
					toggleFlow(userEdit, editMode || newMode);
					toggleFlow(groupList, false);
					toggleFlow(groupEdit, false);
					toggleFlow(committeeList, false);
					toggleFlow(committeeEdit, false);
					toggleFlow(settingList, false);
					toggleFlow(settingEdit, false);
					toggleFlow(reportList, false);
					toggleFlow(reportEdit, false);
					toggleFlow(reportView, false);
					if (editMode || newMode)
					{
						bindEnterKey(find(userEdit, '.userSave'));
						bindEscapeKey(find(userEdit, '.userCancel'));
					}
					if (newMode)
					{
						this.Users[0] = new User();
						this.UserSelection = 0;
						path.id = 0;
					}
					if (editMode || listMode)
					{
						await this.lockRecord('users', this.UserSelection, editMode && !newMode && !cloneMode);
						toggleFlow(userList, listMode);
					}
				},
				groups:async () => {
					if (setID) {this.GroupSelection = id;}
					toggleFlow(home, false);
					toggleFlow(userList, false);
					toggleFlow(userEdit, false);
					toggleFlow(groupEdit, editMode || cloneMode || newMode);
					toggleFlow(committeeList, false);
					toggleFlow(committeeEdit, false);
					toggleFlow(settingList, false);
					toggleFlow(settingEdit, false);
					toggleFlow(reportList, false);
					toggleFlow(reportEdit, false);
					toggleFlow(reportView, false);
					if (editMode || cloneMode|| newMode)
					{
						bindEnterKey(find(groupEdit, '.groupSave'));
						bindEscapeKey(find(groupEdit, '.groupCancel'));
					}
					if (newMode)
					{
						this.Groups[0] = new Group();
						this.GroupSelection = 0;
						path.id = 0;
					}
					else if (cloneMode)
					{
						const group = this.Groups[this.GroupSelection];
						this.Groups[0] = new Group(group);
						this.GroupSelection = 0;
						path.id = 0;
					}
					if (editMode || listMode)
					{
						await this.lockRecord('groups', this.GroupSelection, editMode && !newMode && !cloneMode);
						toggleFlow(groupList, listMode);
					}
				},
				committees:async () => {
					if (setID) {this.CommitteeSelection = id;}
					toggleFlow(home, false);
					toggleFlow(userList, false);
					toggleFlow(userEdit, false);
					toggleFlow(groupList, false);
					toggleFlow(groupEdit, false);
					toggleFlow(committeeEdit, editMode || newMode);
					toggleFlow(settingList, false);
					toggleFlow(settingEdit, false);
					toggleFlow(reportList, false);
					toggleFlow(reportEdit, false);
					toggleFlow(reportView, false);
					if (editMode || newMode)
					{
						bindEnterKey(find(committeeEdit, '.committeeSave'));
						bindEscapeKey(find(committeeEdit, '.committeeCancel'));
					}
					if (newMode)
					{
						this.Committees[0] = new Committee();
						this.CommitteeSelection = 0;
						path.id = 0;
					}
					if (editMode || listMode)
					{
						await this.lockRecord('committees', this.CommiteeSelection, editMode && !newMode && !cloneMode);
						toggleFlow(committeeList, listMode);
					}
				},
				settings:async () => {
					if (setID) {this.SettingSelection = id;}
					else
					toggleFlow(home, false);
					toggleFlow(userList, false);
					toggleFlow(userEdit, false);
					toggleFlow(groupList, false);
					toggleFlow(groupEdit, false);
					toggleFlow(committeeList, false);
					toggleFlow(committeeEdit, false);
					toggleFlow(settingEdit, editMode || newMode);
					toggleFlow(reportList, false);
					toggleFlow(reportEdit, false);
					toggleFlow(reportView, false);
					if (editMode || newMode)
					{
						bindEnterKey(find(settingEdit, '.settingSave'));
						bindEscapeKey(find(settingEdit, '.settingCancel'));
					}
					if (newMode)
					{
						this.Settings[0] = new Setting();
						this.SettingSelection = 0;
						path.id = 0;
					}
					if (editMode || listMode)
					{
						await this.lockRecord('settings', this.SettingSelection, editMode && !newMode && !cloneMode);
						toggleFlow(settingList, listMode);
					}
				},
				reports:async () => {
					if (setID) {this.ReportSelection = id;}
					toggleFlow(home, false);
					toggleFlow(userList, false);
					toggleFlow(userEdit, false);
					toggleFlow(groupList, false);
					toggleFlow(groupEdit, false);
					toggleFlow(committeeList, false);
					toggleFlow(committeeEdit, false);
					toggleFlow(settingList, false);
					toggleFlow(settingEdit, false);
					toggleFlow(reportEdit, editMode || newMode);
					toggleFlow(reportView, false);
					if (editMode || newMode)
					{
						bindEnterKey(find(settingEdit, '.settingSave'));
						bindEscapeKey(find(settingEdit, '.settingCancel'));
					}
					if (newMode)
					{
						this.Reports[0] = new Setting();
						this.ReportSelection = 0;
						path.id = 0;
					}
					if (editMode || listMode)
					{
						await this.lockRecord('reports', this.ReportSelection, editMode && !newMode && !cloneMode);
						toggleFlow(reportList, listMode);
					}
				}
			};
			if (panel) {this._admin_panel = panel;}
			this._admin_panel && includes(this._admin_panel).in(panels) && panels[this._admin_panel]().catch(console.error);
			return path;
		}
		// handle meeting tabs
		const meetingModes = path => {
			const {mode, id} = path;
			if (isNumber(id)) {this.MeetingSelection = id;}
			const modes = {
				list:async () => {
					const suppressError = () => {};
					// this call will generate an exception if the lock does not exist, and the catch is necessary to suppress a spurious error
					if (this.MeetingSelection) {await this.lockRecord('meetings', this.MeetingSelection, false).catch(suppressError);}
					toggleFlow(meetingList, true);
					toggleFlow(meetingEdit, false);
				},
				add:async () => {
					this.Meetings[0] = new Meeting();
					path.id = this.MeetingSelection = 0;
					toggleFlow(meetingList, false);
					toggleFlow(meetingEdit, true);
				},
				clone:async () => {
					const meeting = this.Meetings[this.MeetingSelection];
					this.Meetings[0] = new Meeting(meeting);
					path.id = this.MeetingSelection = 0;
					toggleFlow(meetingList, false);
					toggleFlow(meetingEdit, true);
				},
				edit:async () => {
					await this.lockRecord('meetings', this.MeetingSelection);
					toggleFlow(meetingList, false);
					toggleFlow(meetingEdit, true);
				}
			}
			if (notEqual(mode, 'list'))
			{
				bindEnterKey(find(meetingEdit, '.meetingSave'));
				bindEscapeKey(find(meetingEdit, '.meetingCancel'));
			}
			if (mode && notEqual(mode, this._meeting_mode))
			{
				const exception = message => {
					try
					{
						const mode = 'list';
						focus(getScreen('meetings'), {mode});
						alert(message);
					}
					catch(e) {console.error(e);}
				};
				const switchMode = modes[mode];
				isFunction(switchMode) && switchMode().catch(exception);
				this._meeting_mode = mode;
			}
			return path;
		};
		const busy = this.busy = (busy = true) => {
			toggleVisibility(getElement('busy'), busy);
			if (busy)
			{
				this._previous_focus = this.focus;
				this._previous_blur = this.blur;
			}
			else
			{
				this.focus = this._previous_focus;
				this.blur = this._previous_blur;
			}
			return busy;
		};
		const click = node => () => UI.click(node);
		const bindEnterKey = node => this.focus = click(node);
		const bindEscapeKey = node => this.blur = click(node);
		const clearValue = node => setValue(node, '');
		const hide = node => toggleVisibility(node, false);
		const show = node => toggleVisibility(node, true);
		const {admin, meetings, loginDialog, alertDialog, confirmDialog, passwordDialog, addCriteriaDialog, reportList, reportView} = this.elements;
		this.screens = {
			loading:new Screen('loading', null, show => toggleVisibility(getElement('loading'), show)),
			login:new Screen('login', null, show => {
				const errorField = find(loginDialog, 'div.error');
				if (show)
				{
					const loginField = find(loginDialog, 'input[name="login"]');
					const passwordField = find(loginDialog, 'input[name="password"]');
					[loginField, passwordField].forEach(clearValue);
					[alertDialog, confirmDialog, passwordDialog].forEach(hide);
					busy(true);
					focus(loginField);
					bindEnterKey(find(loginDialog, 'button.btn-primary'));
				}
				else
				{
					hide(setText(errorField, ''));
					busy(false);
				}
				toggleDisabled(getElement('user'), show);
				toggleVisibility(getElement('adminButton'), !show);
				toggleVisibility(getElement('homeButton'), !show);
				toggleVisibility(loginDialog, show);
				const checkActivity = ({loggedin}) => loggedin || this.actions.disconnectSocket();
				setTimeout(() => checkActivity(this.CurrentUser), 30000);
			}),
			meetings:new Screen('meetings', meetingModes, show => toggleFlow(meetings, show)),
			admin:new Screen('admin', adminModes, show => toggleFlow(admin, show))
		};
		this.menus = {
			userMenu:new Menu(getElement('userMenu'))
		};
		const ignoreProps = (subject, type) => {
			const ignoreProps = {
				meeting:['meeting_id', 'sess_number', 'publishtime'],
				user:['user_id', 'password'],
				group:['group_id'],
				committee:['committee_id'],
				setting:['setting_id'],
				report:['report_id', 'user_id']
			};
			ignoreProps[type].forEach(prop => delete subject[prop]);
			return subject;
		};
		const getScreen = screen => this.screens[screen];
		const setUser = user => this.CurrentUser = user;
		const focusAdminList = (path = {}) => this.actions.adminFocus({...path, mode:'list'});
		const focusMeetingList = (path = {}) => this.actions.meetingsFocus({...path, mode:'list'});
		const MeetingFilter = (column, search) => this.MeetingFilter = ({column, search});
		const meetingChanged = () => !isEqual(ignoreProps(new Meeting(this.Meetings[this.MeetingSelection]), 'meeting'), ignoreProps(new Meeting(this.captureMeetingValues()), 'meeting'));
		const userChanged = () => !isEqual(ignoreProps(new User(this.Users[this.UserSelection]), 'user'), ignoreProps(new User(this.captureUserValues()), 'user'));
		const groupChanged = () => !isEqual(ignoreProps(new Group(this.Groups[this.GroupSelection]), 'group'), ignoreProps(new Group(this.captureGroupValues()), 'group'));
		const committeeChanged = () => !isEqual(ignoreProps(new Committee(this.Committees[this.CommitteeSelection]), 'committee'), ignoreProps(new Committee(this.captureCommitteeValues()), 'committee'));
		const settingChanged = () => !isEqual(ignoreProps(new Setting(this.Settings[this.SettingSelection]), 'setting'), ignoreProps(new Setting(this.captureSettingValues()), 'setting'));
		const reportChanged = () => !isEqual(ignoreProps(new Report(this.Reports[this.ReportSelection]), 'report'), ignoreProps(new Report(this.captureReportValues()), 'report'));
		const cancel = (changed, cancel, id) => isEqual(id, 0) || !changed() ? cancel() : confirm('Confirm Cancel', 'Any changes will be lost. Are you sure?').then(confirm => confirm && cancel());
		const save = (changed, save, cancel) => changed() ? confirm('Confirm Save', 'This action will commit all changes. Are you sure?').then(confirm => confirm && save()) : cancel();
		const alert = message => {
			busy();
			setText(find(alertDialog, '.title'), 'Alert');
			setText(find(alertDialog, '.message'), message);
			show(alertDialog);
			apply(tee(bindEnterKey, bindEscapeKey, focus), find(alertDialog, 'button.btn-primary'));
		};
		const confirm = (title, message) => {
			busy();
			setText(find(confirmDialog, '.title'), title);
			setText(find(confirmDialog, '.message'), message);
			show(confirmDialog);
			bindEnterKey(focus(find(confirmDialog, 'button.btn-primary')));
			bindEscapeKey(find(confirmDialog, 'button.btn-warning'));
			// gets a new promise object that will be settled by user interaction
			return this.UserResponse;
		};
		const saveException = e => console.error(e) || alert('An error occurred while saving changes.');
		// handle meeting attachment uploads
		const sanitizeFiles = async files => {
			const {length} = files;
			if (length > 1)
			{
				alert('You cannot attach multiple files to the same meeting.');
				return false;
			}
			if (!length) {return false;}
			if (isObject(this._meeting_attachment)) {return await confirm('Overwrite File', 'This action will replace the existing attachment.  Continue?');}
			return true;
		}
		const saveAttachment = getResponse => {
			// the incoming response always returns an array of elements
			// only the first one is needed since we don't allow multiple files to be uploaded
			const save = async ([values]) => {
				try
				{
					const {mimetype} = values;
					if (isEqual(mimetype, 'application/pdf'))
					{
						delete values.mimetype;
						const {sessionid} = this.CurrentUser;
						const {newAttachment} = this.actions;
						const fileid = await newAttachment({sessionid, values});
						await this.refreshAttachments(sessionid);
						this.AttachmentSelection = fileid;
					}
					else {alert('Invalid filetype.');}
				}
				catch(e)
				{
					console.error(e);
					alert('An error occurred during save operation.');
				}
			};
			getResponse.then(save, console.error);
		};
		const upload = new Upload(find(meetingEdit, 'div.dropzone'), find(meetingEdit, 'progress.upload'), sanitizeFiles, saveAttachment);
		// this callback is triggered by a file selector button in the index.htm source file
		this.handleFiles = files => upload.handleFiles(files);
		// report handling functions
		const addColumn = criterion => {
			const {newColumn} = this.ReportCriteria;
			newColumn({criterion});
		};
		const addFilter = criterion => {
			const {filters, newFilter} = this.ReportCriteria;
			const {operators, columns, type} = filters[criterion];
			// establish default values for new filter...  the user has the option to modify these
			const [operator] = operators;
			const [condition] = iterable(columns, KEYS);
			newFilter({criterion, operator, condition:isEqual('text', type) ? '' : condition, conjunction:'AND'});
		};
		const addSort = criterion => {
			const {sorts, newSort} = this.ReportCriteria;
			const {columns} = sorts[criterion];
			// establish default value for new sort...  the user has the option to modify this
			const [column] = iterable(columns, KEYS);
			newSort({criterion, column, order:'DESC'});
		};
		const addLimit = criterion => {
			const {limits, newLimit} = this.ReportCriteria;
			const {spans} = limits[criterion];
			// establish default value for new limit...  the user has the option to modify this
			const [span] = iterable(spans, KEYS);
			newLimit({criterion, span});
		};
		const removeColumn = index => this.ReportCriteria.removeColumn(index, true);
		const removeFilter = index => this.ReportCriteria.removeFilterBy(index, true);
		const removeSort = index => this.ReportCriteria.removeSortBy(index, true);
		const removeLimit = index => this.ReportCriteria.removeLimitBy(index, true);
		const newReportCriteria = async datasource => {
			const {isEmpty} = Helpers;
			const allEmpty = (previous, next) => previous && isEmpty(next);
			const {columnCriteria, filterCriteria, sortCriteria, limitCriteria} = this.ReportCriteria;
			const noCriteria = [columnCriteria, filterCriteria, sortCriteria, limitCriteria].reduce(allEmpty, true);
			const columnNode = UI.getElement('columnCriteria');
			const filterNode = UI.getElement('filterCriteria');
			const sortNode = UI.getElement('sortCriteria');
			const limitNode = UI.getElement('limitCriteria');
			const newCriteria = () => this.ReportCriteria = new ReportControls(new Report({datasource}), this.reportColumns, columnNode, filterNode, sortNode, limitNode);
			if (noCriteria) {newCriteria();}
			else if (await confirm('Confirm Change', 'Changing data sources will remove any existing filter criteria.  Continue?')) {newCriteria();}
			else {UI.setValue(UI.find(this.elements.reportEdit, 'select.dataSource'), this.ReportCriteria.datasource);}
		};
		// the actions explicitly defined below are handlers for frontend activity initiated by user interaction
		// this object will be decorated with backend methods upon receipt of the "up" message from the server
		// care must be taken to use unique names for frontend and backend methods, or some frontend methods will be overwritten
		this.actions = {
			toggleMenu:({menu}) => {
				menu = this.menus[menu];
				UI.click(menu);
				menu.visible && bindEscapeKey(menu);
			},
			login:() => {
				const username = captureString(find(loginDialog, 'input[name="login"]'));
				const password = MD5(captureString(find(loginDialog, 'input[name="password"]')));
				const displayError = message => show(setText(find(loginDialog, 'div.error'), message));
				const badCredentials = () => displayError('Unauthorized user or bad password');
				const formIncomplete = () => displayError('All fields are required');
				const authenticated = user => setUser(user) && this.clearMeetingFilter();
				const checkCredentials = () => this.actions.authenticateUser({username, password, sessionid:this.SessionID}).then(authenticated, badCredentials);
				if (isEmpty(username) || isEmpty(password)) {formIncomplete();}
				else if (this.isConnected) {checkCredentials();}
				else
				{
					this.Ready.then(checkCredentials);
					this.actions.connectSocket();
				}
			},
			logout:() => {
				const {sessionid} = this.CurrentUser;
				this.actions.endSession({sessionid}).then(setUser, console.error);
			},
			changePassword:() => {
				busy();
				this.hideMenu('userMenu');
				show(passwordDialog);
				focus(find(passwordDialog, 'input[name="password"]'));
				setValue(find(passwordDialog, 'input[name="login"]'), this.CurrentUser.login)
				bindEnterKey(find(passwordDialog, 'button.passwordSave'));
				bindEscapeKey(find(passwordDialog, 'button.passwordClose'));
			},
			passwordSave:() => {
				const {sessionid} = this.CurrentUser;
				const {updatePassword, passwordClose} = this.actions;
				const displayError = message => show(setText(find(passwordDialog, 'div.error'), message));
				const saveSuccess = () => {
					passwordClose();
					alert('Your password has been updated.');
				};
				const saveError = e => {
					passwordClose();
					alert('An error occurred during save.  Password not changed.');
					console.error(e);
				};
				const password1 = find(passwordDialog, 'input[name="password"]');
				const password2 = find(passwordDialog, 'input[name="confirm"]');
				const password = captureString(password1);
				const confirm = captureString(password2);
				if (isEmpty(password)) {return displayError('Password cannot be blank');}
				if (notEqual(password, confirm)) {return displayError('Passwords do not match');}
				const password_hash = MD5(password);
				[password1, password2].forEach(clearValue);
				return updatePassword({sessionid, values:{password_hash}}).then(saveSuccess, saveError);
			},
			dialogClose:() => {
				busy(false);
				hide(addCriteriaDialog);
			},
			passwordClose:() => {
				busy(false);
				hide(passwordDialog);
			},
			alertClose:() => {
				busy(false);
				hide(alertDialog);
			},
			confirmClose:({response}) => {
				busy(false);
				hide(confirmDialog);
				// settles the queued promise object
				this.UserResponse = isEqual(response, 'ok');
			},
			meetingsFocus:data => focus(getScreen('meetings'), data),
			adminFocus:data => focus(getScreen('admin'), data),
			deleteMeeting:() => {
				const {sessionid} = this.CurrentUser;
				const meeting_id = this.MeetingSelection;
				const {removeMeeting} = this.actions;
				const getConfirmation = () => confirm('Confirm Delete', 'Meetings should be deleted only under special circumstances.  Continue?');
				const commit = confirmed => confirmed && removeMeeting({sessionid, values:{meeting_id}}).catch(alert);
				return getConfirmation().then(commit).then(focusMeetingList);
			},
			deleteUser:() => {
				const {sessionid} = this.CurrentUser;
				const user_id = this.UserSelection;
				const {removeUser} = this.actions;
				const getConfirmation = () => confirm('Confirm Delete', 'This action will completely remove the user account and cannot be undone.  Continue?');
				const commit = confirmed => confirmed && removeUser({sessionid, values:{user_id}}).catch(alert);
				return getConfirmation().then(commit).then(focusAdminList);
			},
			deleteGroup:() => {
				const {sessionid} = this.CurrentUser;
				const group_id = this.GroupSelection;
				const {removeGroup} = this.actions;
				const getConfirmation = () => confirm('Confirm Delete', 'This action will completely remove the group and cannot be undone.  Continue?');
				const commit = confirmed => confirmed && removeGroup({sessionid, values:{group_id}}).catch(alert);
				return getConfirmation().then(commit).then(focusAdminList);
			},
			deleteCommittee:() => {
				const {sessionid} = this.CurrentUser;
				const committee_id = this.CommitteeSelection;
				const {removeCommittee} = this.actions;
				const getConfirmation = () => confirm('Confirm Delete', 'This action will completely remove the committee and cannot be undone.  Continue?');
				const commit = confirmed => confirmed && removeCommittee({sessionid, values:{committee_id}}).catch(alert);
				return getConfirmation().then(commit).then(focusAdminList);
			},
			deleteSetting:() => {
				const {sessionid} = this.CurrentUser;
				const setting_id = this.SettingSelection;
				const {removeSetting} = this.actions;
				const getConfirmation = () => confirm('Confirm Delete', 'This action will completely remove the setting and cannot be undone.  Continue?');
				const commit = confirmed => confirmed && removeSetting({sessionid, values:{setting_id}}).catch(alert);
				return getConfirmation().then(commit).then(focusAdminList);
			},
			deleteReport:() => {
				const {sessionid} = this.CurrentUser;
				const report_id = this.ReportSelection;
				const {removeReport} = this.actions;
				const getConfirmation = () => confirm('Confirm Delete', 'This action will completely remove the report and cannot be undone.  Continue?');
				const commit = confirmed => confirmed && removeReport({sessionid, values:{report_id}}).catch(alert);
				return getConfirmation().then(commit).then(focusAdminList);
			},
			meetingSave:async () => {
				const val = this.MeetingSelection, operator = '=';
				const editMode = Boolean(val);
				const oldValues = this.Meetings[val];
				const values = this.captureMeetingValues();
				const {canceled, displaytime, video_type} = values;
				// validate form data
				if (isEqual(displaytime, '')) {return alert('If specified, Display Time value cannot be blank.');}
				if (canceled && (isEqual(video_type, 'R') || isEqual(video_type, 'L')))
				{
					const response = await confirm('Confirm Action', 'Canceling the meeting will also remove the request for broadcast. Continue?');
					if (!response) {return;}
					values.notation = 'Meeting canceled';
				}
				else if (canceled && isEqual(oldValues.canceled, false))
				{
					const response = await confirm('Confirm Action', 'Are you certain you wish to cancel this meeting?');
					if (!response) {return;}
					values.notation = 'Meeting canceled';
				}
				if (isNull(values.publishtime)) {delete values.publishtime;}
				else if (!editMode && !today(values.publishtime) && past(values.publishtime))
				{
					const response = await confirm('Time Discrepancy', 'Publish time cannot be in the past.  Do you wish to publish the meeting now?');
					if (response) {values.publishtime = new Date();}
					else {return;}
				}
				if (!editMode && !today(values.meetingtime) && past(values.meetingtime))
				{
					return alert('The meeting cannot start in the past.')
				}
				const onSave = async () => {
					const {sessionid} = this.CurrentUser;
					if (editMode)
					{
						// mode === 'edit'
						const {updateMeeting} = this.actions;
						// don't overwrite sess_number or publishtime in existing meeting
						delete values.sess_number;
						delete values.publishtime;
						if (values.canceled) {values.video_type = 'N';}
						if (isEqual(values.video_type, 'R') && isEqual(oldValues.videotype, 'L')) {values.videotype = 'L'}
						const criteria = {meeting_id:{operator, val}};
						await updateMeeting({sessionid, values, criteria}).catch(saveException);
					}
					else
					{
						// mode === 'new' || mode === 'clone'
						const {newMeeting} = this.actions;
						await newMeeting({sessionid, values}).catch(saveException);
					}
					focusMeetingList();
				}
				save(meetingChanged, onSave, focusMeetingList);
			},
			cancelMeeting:async () => {
				const val = this.MeetingSelection, operator = '=';
				const {video_type} = this.Meetings[val];
				if (isEqual(video_type, 'R') || isEqual(video_type, 'L'))
				{
					const response = await confirm('Confirm Action', 'Canceling the meeting will also remove the request for broadcast. Continue?');
					if (!response) {return;}
				}
				else
				{
					const response = await confirm('Confirm Action', 'Are you certain you wish to cancel this meeting?');
					if (!response) {return;}
				}
				const {sessionid} = this.CurrentUser;
				const {updateMeeting} = this.actions;
				const criteria = {meeting_id:{operator, val}};
				await updateMeeting({sessionid, values:{...this.Meetings[val], canceled:true, video_type:'N'}, criteria}).catch(saveException);
				focusMeetingList({id:0});
			},
			userSave:async () => {
				const user_id = this.UserSelection;
				const values = this.captureUserValues();
				const {password, confirm} = values;
				delete values.confirm;
				delete values.password;
				if (isEmpty(password)) {return alert('When specifying a new password, entry cannot be blank.');}
				if (notEqual(password, confirm)) {return alert('Passwords do not match.');}
				if (notEqual(password, this._randomString)) {values.password_hash = MD5(password);}
				const onSave = async () => {
					const {sessionid} = this.CurrentUser;
					if (user_id > 0)
					{
						// mode === 'edit'
						const {updateUser} = this.actions;
						const criteria = {user_id};
						await updateUser({sessionid, values, criteria}).catch(saveException);
					}
					else
					{
						// mode === 'new'
						const {newUser} = this.actions;
						await newUser({sessionid, values}).catch(saveException);
					}
					focusAdminList();
				}
				save(userChanged, onSave, focusAdminList);
			},
			groupSave:async () => {
				const values = this.captureGroupValues();
				const onSave = async () => {
					const val = this.GroupSelection, operator = '=';
					const {sessionid} = this.CurrentUser;
					if (val > 0)
					{
						// mode === 'edit'
						const {updateGroup} = this.actions;
						const criteria = {group_id:{operator, val}};
						await updateGroup({sessionid, values, criteria}).catch(saveException);
					}
					else
					{
						// mode === 'new' || mode === 'clone'
						const {newGroup} = this.actions;
						await newGroup({sessionid, values}).catch(saveException);
					}
					focusAdminList();
				}
				save(groupChanged, onSave, focusAdminList);
			},
			committeeSave:async () => {
				const values = this.captureCommitteeValues();
				const onSave = async () => {
					const val = this.CommitteeSelectionm, operator = '=';
					const {sessionid} = this.CurrentUser;
					if (val > 0)
					{
						// mode === 'edit'
						const {updateCommittee} = this.actions;
						const criteria = {committee_id:{operator, val}};
						await updateCommittee({sessionid, values, criteria}).catch(saveException);
					}
					else
					{
						// mode === 'new'
						const {newCommittee} = this.actions;
						await newCommittee({sessionid, values}).catch(saveException);
					}
					focusAdminList();
				}
				save(committeeChanged, onSave, focusAdminList);
			},
			settingSave:async () => {
				const values = this.captureSettingValues();
				const onSave = async () => {
					const val = this.SettingSelection, operator = '=';
					const {sessionid} = this.CurrentUser;
					if (val > 0)
					{
						// mode === 'edit'
						const {updateSetting} = this.actions;
						const criteria = {setting_id:{operator, val}};
						await updateSetting({sessionid, values, criteria}).catch(saveException);
					}
					else
					{
						// mode === 'new'
						const {newSetting} = this.actions;
						await newSetting({sessionid, values}).catch(saveException);
					}
					focusAdminList();
				}
				save(settingChanged, onSave, focusAdminList);
			},
			reportSave:async () => {
				const values = this.captureReportValues();
				const onSave = async () => {
					const val = this.ReportSelection, operator = '=';
					const {sessionid} = this.CurrentUser;
					if (val > 0)
					{
						// mode === 'edit'
						const {updateReport} = this.actions;
						const criteria = {report_id:{operator, val}};
						await updateReport({sessionid, values, criteria}).catch(saveException);
					}
					else
					{
						// mode === 'new'
						const {newReport} = this.actions;
						await newReport({sessionid, values}).catch(saveException);
					}
					focusAdminList();
				}
				save(reportChanged, onSave, focusAdminList);
			},
			meetingCancel:() => {
				const onCancel = () => {
					this.MeetingSelection = this.MeetingSelection;
					document.activeElement.blur();
					focusMeetingList();
				};
				cancel(meetingChanged, onCancel, this.MeetingSelection);
			},
			userCancel:() => {
				const onCancel = () => {
					this.UserSelection = this.UserSelection;
					focusAdminList();
				};
				cancel(userChanged, onCancel, this.UserSelection);
			},
			groupCancel:() => {
				const onCancel = () => {
					this.GroupSelection = this.GroupSelection;
					focusAdminList();
				};
				cancel(groupChanged, onCancel, this.GroupSelection);
			},
			committeeCancel:() => {
				const onCancel = () => {
					this.CommitteeSelection = this.CommitteeSelection;
					focusAdminList();
				};
				cancel(committeeChanged, onCancel, this.CommitteeSelection);
			},
			settingCancel:() => {
				const onCancel = () => {
					this.SettingSelection = this.SettingSelection;
					focusAdminList();
				};
				cancel(settingChanged, onCancel, this.SettingSelection);
			},
			reportCancel:() => {
				const onCancel = () => {
					this.ReportSelection = this.ReportSelection;
					focusAdminList();
				};
				cancel(reportChanged, onCancel, this.ReportSelection);
			},
			switchScreen:path => {
				const {screen} = path;
				this.Screen = screen;
				focus(this.Screen, path);
			},
			selectRow({screen, id})
			{
				hasClass(this, 'selected') && (id = 0);
				focus(getScreen(screen), {id});
			},
			checkButton()
			{
				const checkbox = find(this, 'input[type="checkbox"]');
				checkbox.checked ^= 1;
				triggerChange(checkbox);
			},
			customTime()
			{
				const {checked} = this;
				const customTime = find(meetingEdit, '#customTime');
				const fixedTime = find(meetingEdit, '#fixedTime');
				toggleFlow(customTime, checked);
				toggleFlow(fixedTime, !checked);
			},
			publishNow()
			{
				const {checked} = this;
				const publishTime = find(meetingEdit, '#publishTime');
				const date = find(publishTime, 'input[type=date]');
				const time = find(publishTime, 'input[type=time]');
				toggleDisabled(date, checked);
				toggleDisabled(time, checked);
			},
			selectChamber()
			{
				const {value} = this;
				const senateCommittee = find(meetingEdit, 'span.senateCommittee');
				const houseCommittee = find(meetingEdit, 'span.houseCommittee');
				const hasSenate = isEqual(value, 'J') || isEqual(value, 'S');
				const hasHouse = isEqual(value, 'J') || isEqual(value, 'H');
				toggleFlow(senateCommittee, hasSenate);
				toggleFlow(houseCommittee, hasHouse);
			},
			filterTitle() {MeetingFilter('title', this.value);},
			filterCommittee() {MeetingFilter('committee', +this.value);},
			clearFilter:() => this.clearMeetingFilter(),
			collapseMenu()
			{
				const filterMeetings = find(meetings, '.filterMeetings');
				const expandedSpan = find(this, 'span#expanded');
				const collapsedSpan = find(this, 'span#collapsed');
				const collapsed = hasClass(expandedSpan, 'noflow');
				toggleFlow(expandedSpan, collapsed);
				toggleFlow(collapsedSpan, !collapsed);
				toggleClass(filterMeetings, 'noflowMobile', collapsed);
			},
			dataSource()
			{
				newReportCriteria(this.value);
			},
			reportCriteria:({type}) => {
				busy();
				const {iterable} = Helpers;
				const defaultOption = '<option value="none">Select...</option>';
				const options = options => defaultOption + iterable(options).map(([value, {name}]) => `<option value="${value}">${name}</option>`).join('');
				UI.setHTML(UI.find(addCriteriaDialog, 'select'), options(this.ReportCriteria[type]));
				UI.toggleDisabled(UI.setData(UI.find(addCriteriaDialog, 'button.addCriterion'), {type}), true);
				show(addCriteriaDialog);
			},
			selectCriterion()
			{
				UI.toggleDisabled(UI.find(UI.closest(this, 'section'), 'button.addCriterion'), isEqual(this.value, 'none'));
			},
			addCriterion({type})
			{
				const {value} = UI.find(UI.closest(this, 'section'), 'select');
				switch (type)
				{
					case 'columns':
					{
						addColumn(value);
						break;
					}
					case 'filters':
					{
						addFilter(value);
						break;
					}
					case 'sorts':
					{
						addSort(value);
						break;
					}
					case 'limits':
					{
						addLimit(value);
						break;
					}
				}
				hide(addCriteriaDialog);
				busy(false);
			},
			removeCriterion({type, index})
			{
				switch (type)
				{
					case 'columns':
					{
						removeColumn(index);
						break;
					}
					case 'filters':
					{
						removeFilter(index);
						break;
					}
					case 'sorts':
					{
						removeSort(index);
						break;
					}
					case 'limits':
					{
						removeLimit(index);
						break;
					}
				}
			},
			runReport:async () => {
				const {iterable} = Helpers;
				const {generateReport} = this.actions;
				const val = this.ReportSelection, operator = '=', quote = '"';
				const {report_name} = this.Reports[val];
				const {sessionid} = this.CurrentUser;
				const criteria = {report_id:{operator, val}};
				const dateColumns = [];
				const boolColumns = [];
				const chamberColumns = [];
				const videoColumns = [];
				const billColumns = [];
				const friendlyNames = {
					event_id:'Event ID',
					event_type:'Description',
					table_name:'Data From',
					event_timestamp:'Event Date',
					login_name:'User',
					meeting_id:'Meeting ID',
					sess_number:'Session',
					chamber:'Chamber',
					publishtime:'Publish Date',
					meetingtime:'Meeting Date',
					displaytime:'Display Time',
					committeename:'Meeting Title',
					bill_list:'Bills',
					special_requests:'Requests',
					notation:'Notifications',
					phone:'Contact Phone',
					location:'Location',
					agendalink:'Agenda Attached',
					canceled:'Canceled',
					internal:'Internal Only',
					video_type:'Video Status',
					video_title:'Video Title',
					video_filename:'Video Filenames',
					video_duration:'Video Durations',
					youtube_video_id:'YouTube Video ID',
					feed_name:'Feed Name',
					house_committee:'House Committee',
					senate_committee:'Senate Committee'
				};
				const chambers = {
					S:'Senate',
					H:'House',
					J:'Joint'
				};
				const videoStatus = {
					N:'None',
					R:'Requested',
					L:'Live',
					A:'Archive',
					I:'Ingest'
				}
				const formatBills = bills => bills.split(',').map(v => Number(v.trim())).filter(v => v).map(v => v >= 3000 ? 'S.'+v : 'H.'+v).join(', ');
				const rawData = ([open, close]) => cell => cell.replace(open, quote).replace(close, quote);
				const allHeadings = (heading, index) => {
					let html = includes(heading).in(friendlyNames) ? `<th class="nowrap">${friendlyNames[heading]}</th>` : `<th>${heading}</th>`;
					if (heading.includes('canceled') || heading.includes('internal') || heading.includes('agendalink')) {boolColumns.push(index);}
					else if (heading.includes('chamber')) {chamberColumns.push(index);}
					else if (heading.includes('video_type')) {videoColumns.push(index);}
					else if (heading.includes('bill_list')) {billColumns.push(index);}
					// break datetime columns into separate date and time columns to maintain data compatibility with spreadsheet applications
					else if (heading.includes('timestamp'))
					{
						dateColumns.push(index);
						html += `<th>Event Time</th>`;
					}
					else if (heading.includes('meetingtime'))
					{
						dateColumns.push(index);
						html += `<th>Meeting Time</th>`;
					}
					else if (heading.includes('publishtime'))
					{
						dateColumns.push(index);
						html += `<th>Publish Time</th>`;
					}
					return html;
				};
				const allData = (value, index) => {
					if (includes(index).in(boolColumns)) {value = `${value ? '&#10004;' : '&#10006;'}`;}
					else if (includes(index).in(chamberColumns)) {value = chambers[value];}
					else if (includes(index).in(videoColumns)) {value = videoStatus[value];}
					else if (includes(index).in(billColumns)) {value = formatBills(value);}
					else if (isNull(value)) {value = '-';}
					if (includes(index).in(dateColumns))
					{
						value = new Date(value);
						return `<td>${value.toLocaleDateString()}</td><td>${value.toLocaleTimeString()}</td>`;
					}
					else {return `<td>${value}</td>`;}
				};
				try
				{
					const report = await generateReport({sessionid, criteria});
					this.ReportOutput = [];
					const rows = [];
					let even = false;
					UI.setText(UI.find(reportView, 'div.title'), `${report_name} Report: Created ${this.formatDateTime(new Date(), false, false).replace(/&nbsp;/g, ' ')}`);
					if (isEqual(report.length, 0))
					{
						rows.push('<tr><th>Results</th></tr>')
						rows.push('<tr><td>No data to display.</td></tr>')
					}
					else
					{
						const [first] = report;
						const headings = iterable(first, KEYS).map(allHeadings);
						rows.push(`<tr>${headings.join('')}</tr>`);
						this.ReportOutput.push(headings.map(rawData(['<th class="nowrap">', '</th>'])));
						for (const row of report)
						{
							even = !even;
							const alternate = even ? 'even' : 'odd';
							const rowClass = `${alternate}`;
							const values = iterable(row, VALUES).map(allData);
							this.ReportOutput.push(values.map(rawData(['<td>', '</td>'])));
							const html = `<tr class="${rowClass}">${values.join('')}</tr>`;
							rows.push(html);
						}
					}
					UI.setHTML(UI.find(reportView, 'table#report'), rows.join(''));
					UI.toggleFlow(reportView, true);
					UI.toggleFlow(reportList, false);
				}
				catch(e)
				{
					alert('An error occurred while generating the report.');
					console.error(e);
				}
			},
			downloadReport:() => {
				const val = this.ReportSelection, delimiter = ',', EOL = '\n';
				const {report_name} = this.Reports[val];
				const d = new Date();
				let ye = new Intl.DateTimeFormat('en', {year:'numeric'}).format(d);
				let mo = new Intl.DateTimeFormat('en', {month:'2-digit'}).format(d);
				let da = new Intl.DateTimeFormat('en', {day:'2-digit'}).format(d);
				const joinAll = v => v.join(delimiter);
				const link = UI.download(`${report_name}${ye}${mo}${da}.csv`, this.ReportOutput.map(joinAll).join(EOL), 'text/csv')
				UI.find(reportView, 'span.changedStatus').appendChild(link);
			},
			printReport:() => {
				window.print();
			},
			closeReport:() => {
				UI.toggleFlow(reportView, false);
				UI.toggleFlow(reportList, true);
			}
		};
		// bind real-time clock display
		this.tick || (this.displayClock());
		const applyDefaultPath = ({screen, panel, mode, id}) => {
			const {isEmpty} = Helpers;
			if (isEmpty(screen))
			{
				screen = 'meetings';
				panel = 'home';
				mode = 'list';
				id = 0;
			}
			else if (isEmpty(panel))
			{
				panel = 'home';
				mode = 'list';
				id = 0;
			}
			else if (isEmpty(id))
			{
				mode = 'list';
				id = 0;
			}
			else {id = +id;}
			return {screen, panel, mode, id};
		};
		// recall specified hashpath from the client URL, or fall back to default path
		const clientNavigate = this.clientNavigate = () => this.actions.switchScreen(applyDefaultPath(getHashParams()));
		const triggerAction = this.triggerAction = async node => {
			// this function needs to be async to prevent blocking the UI thread
			try
			{
				const {iterable} = Helpers;
				for (const [action, method] of iterable(this.actions))
				{
					// a check for visibility is made since the event is valid here only if the user initiated the click
					// this defeats spurious events that can be initiated programmatically on a cached node
					if (UI.hasClass(node, action) && UI.isVisible(node))
					{
						method.call(node, UI.getData(node));
						break;
					}
				}
			}
			catch(e) {console.error(e);}
		}
		const tryNext = node => node ? (triggerAction(node), false) : true;
		const hideMenu = next => next && this.hideMenu('userMenu');
		const testTarget = (target, selectors) => selectors.reduce((previous, selector) => previous && tryNext(closest(target, selector)), true);
		const onkeypress = ({keyCode, charCode}) => {
			const code = charCode || keyCode;
			// enter key
			if (isEqual(code, 13))
			{
				if (this.focus)
				{
					this.focus();
					return false;
				}
				else {return true;}
			}
			// escape key
			else if (isEqual(code, 27))
			{
				if (this.blur)
				{
					this.blur();
					return false;
				}
				else {return true;}
			}
			return true;
		};
		// bind handlers to user events
		const handlers = {
			click:event => {
				// consume this event
				event.preventDefault();
				const {target} = event;
				hideMenu(testTarget(target, ['button:not([disabled]', 'tr', 'div']))
			},
			change:({target}) => testTarget(target, ['select'])
		};
		for (const [event, handler] of iterable(handlers)) {document.addEventListener(event, handler);}
		document.onkeyup = onkeypress;
		window.onhashchange = clientNavigate;
		bindEnterKey(null);
		bindEscapeKey(null);
	}
}
