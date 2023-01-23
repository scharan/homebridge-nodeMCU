// ISC License
//
// Copyright (c) [year] [fullname]
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
// REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
// AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
// INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
// LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
// OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
// PERFORMANCE OF THIS SOFTWARE.

let request = require('request');
var mdns = require('multicast-dns')();

// This should be a union of accessories from mDNS discovery and from Homebridge Accessories config.json
let DiscoveredAccessories = {};

// Remember to update accessory IFF some accessory information has changed
mdns.on('response', function(response) {
	response.answers.forEach(function(answer) {
		if ((answer.name.includes('WaterLeakSensor') && answer.type == 'SRV')) {
			let accessoryName = answer.data.target;
			DiscoveredAccessories[accessoryName] = {port: answer.port};

			// Send out a query anyway, in case IP has changed
			mdns.query({
				questions: [{name: accessoryName, type:'A'}]
			});
		} else if ((Object.keys(DiscoveredAccessories).includes(answer.name) &&
					answer.type == 'A' &&
					answer.class == 'IN')) {
			DiscoveredAccessories[answer.name].ip = answer.data;
		}
	});
});

let Service;
let Characteristic;
const DEF_UNITS = "ppm";
const DEF_TIMEOUT = 1000;
const DEF_INTERVAL = 120000;  // in milisecond

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-nodemcu", "NodeMCU", NodeMCU);
}

function NodeMCU(log, config) {
	this.log = log;
	this.not_available = "Not available";

	this.name = config["name"];
	this.serviceName = config.service.replace(/\s/g, '');
	this.characteristics = config["characteristics"] || ['LeakDetected'];
	this.url = config["url"];
	this.http_method = config["http_method"] || "GET";
	this.timeout = config["timeout"] || DEF_TIMEOUT;
	this.units = config["units"] || DEF_UNITS;
	this.auth = config["auth"];
	this.update_interval = Number( config["update_interval"] || DEF_INTERVAL );
	this.manufacturer = config["manufacturer"] || this.not_available;
	this.model = config["model"] || this.not_available;
	this.serial_number = config["serial_number"] || this.not_available;

	// Internal variables
	this.last_value = null;
	this.waiting_response = false;
	this.listener = [];
}

NodeMCU.prototype.updateState = function (state) {
	if (this.waiting_response) {
		// this.log('awaiting response!!!');
		return;
	}

	this.waiting_response = true;
	this.last_value = new Promise((resolve, reject) => {
		var uri = this.url;
		
		if (typeof state !== "undefined"){
			if(this.http_method === "GET")
				uri += "?" + state;
		}
		
		var ops = {
			uri: uri,
			method: this.http_method,
			timeout: this.timeout
		};
		if (this.auth) {
			ops.auth = {
				user: this.auth.user,
				pass: this.auth.pass
			};
		}
		request(ops, (error, res, body) => {
			var value = {};
			if (error) {
				this.log('HTTP bad response (' + ops.uri + '): ' + error.message);
			} 
			else {
				try {
					var response = JSON.parse(body);
					for (var index in this.characteristics) {
						var charac = this.characteristics[index].replace(/\s/g, '');
						if(response.hasOwnProperty(charac)) {
							value[charac] = Number(response[charac]);
						}
						else
							this.log("NodeMCU: " + this.characteristics[index] + " has no information");
					}

					if (Object.keys(value).length == 0) {
						throw new Error('NodeMCU: No valid value');
					}
					
				} catch (parseErr) {
					this.log('Error processing received information: ' + parseErr.message);
					error = parseErr;
				}
			}
			if (!error) {
				resolve(value);
			} 
			else {
				this.log("NodeMCU: " + error);
				reject(error);
			}
			this.waiting_response = false;
		});
	}).then((value) => {
		for (var charac in value) {
			this.mservice.getCharacteristic(Characteristic[charac]).updateValue(value[charac], null);
		}
		return value;
	}, (error) => {
		this.log("NodeMCU: " + error);
		return error;
	});
}

NodeMCU.prototype.getServices = function () {
	this.informationService = new Service.AccessoryInformation();
	this.informationService
	.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
	.setCharacteristic(Characteristic.Model, this.model)
	.setCharacteristic(Characteristic.SerialNumber, this.serial_number);

	switch (this.serviceName) {
		case "AccessoryInformation": 
			this.mservice = new Service.AccessoryInformation(this.name); 
			break;
		case "AirQualitySensor": 
			this.mservice = new Service.AirQualitySensor(this.name); 
			break;
		case "BatteryService": 
			this.mservice = new Service.BatteryService(this.name); 
			break;
		case "BridgeConfiguration": 
			this.mservice = new Service.BridgeConfiguration(this.name); 
			break;
		case "BridgingState": 
			this.mservice = new Service.BridgingState(this.name); 
			break;
		case "CameraControl": 
			this.mservice = new Service.CameraControl(this.name); 
			break;
		case "CameraRTPStreamManagement": 
			this.mservice = new Service.CameraRTPStreamManagement(this.name); 
			break;
		case "CarbonDioxideSensor": 
			this.mservice = new Service.CarbonDioxideSensor(this.name); 
			break;
		case "CarbonMonoxideSensor": 
			this.mservice = new Service.CarbonMonoxideSensor(this.name); 
			break;
		case "ContactSensor": 
			this.mservice = new Service.ContactSensor(this.name); 
			break;
		case "Door":
			this.mservice = new Service.Door(this.name); 
			break;
		case "Doorbell": 
			this.mservice = new Service.Doorbell(this.name); 
			break;
		case "Fan": 
			this.mservice = new Service.Fan(this.name); 
			break;
		case "GarageDoorOpener": 
			this.mservice = new Service.GarageDoorOpener(this.name); 
			break;
		case "HumiditySensor": 
			this.mservice = new Service.HumiditySensor(this.name); 
			break;
		case "LeakSensor": 
			this.mservice = new Service.LeakSensor(this.name); 
			break;
		case "LightSensor": 
			this.mservice = new Service.LightSensor(this.name); 
			break;
		case "Lightbulb": 
			this.mservice = new Service.Lightbulb(this.name); 
			break;
		case "LockManagement": 
			this.mservice = new Service.LockManagement(this.name); 
			break;
		case "LockMechanism": 
			this.mservice = new Service.LockMechanism(this.name); 
			break;
		case "Microphone": 
			this.mservice = new Service.LockMechanism(this.name); 
			break;
		case "MotionSensor": 
			this.mservice = new Service.MotionSensor(this.name); 
			break;
		case "OccupancySensor": 
			this.mservice = new Service.OccupancySensor(this.name); 
			break;
		case "Outlet": 
			this.mservice = new Service.Outlet(this.name); 
			break;
		case "Pairing": 
			this.mservice = new Service.Pairing(this.name); 
			break;
		case "ProtocolInformation": 
			this.mservice = new Service.ProtocolInformation(this.name); 
			break;
		case "Relay": 
			this.mservice = new Service.Relay(this.name); 
			break;
		case "SecuritySystem": 
			this.mservice = new Service.SecuritySystem(this.name); 
			break;
		case "SmokeSensor": 
			this.mservice = new Service.SmokeSensor(this.name); 
			break;
		case "Speaker": 
			this.mservice = new Service.Speaker(this.name); 
			break;
		case "StatefulProgrammableSwitch": 
			this.mservice = new Service.StatefulProgrammableSwitch(this.name); 
			break;
		case "StatelessProgrammableSwitch": 
			this.mservice = new Service.StatelessProgrammableSwitch(this.name); 
			break;
		case "Switch": 
			this.mservice = new Service.Switch(this.name); 
			break;
		case "TemperatureSensor": 
			this.mservice = new Service.TemperatureSensor(this.name); 
			break;
		case "Thermostat": 
			this.mservice = new Service.Thermostat(this.name); 
			break;
		case "TimeInformation": 
			this.mservice = new Service.TimeInformation(this.name); 
			break;
		case "TunneledBTLEAccessoryService": 
			this.mservice = new Service.TunneledBTLEAccessoryService(this.name); 
			break;
		case "Window": 
			this.mservice = new Service.Window(this.name); 
			break;
		case "WindowCovering": 
			this.mservice = new Service.WindowCovering(this.name); 
			break;
		default: 
			this.mservice = null;  
			this.log("NodeMCU: service" + this.serviceName + " not available yet!");
	}

	if(this.characteristics != null) {
		if (typeof this.characteristics === "string")
			this.characteristics = [this.characteristics];
		
		for (var index in this.characteristics) {
			var charac = this.characteristics[index].replace(/\s/g, '');
			if(Characteristic.hasOwnProperty(charac)){
				this.listener[index] = charcHelper(charac);
				
				this.mservice.getCharacteristic(Characteristic[charac]).on('get', this.listener[index].getState.bind(this));
				this.mservice.getCharacteristic(Characteristic[charac]).on('set', this.listener[index].setState.bind(this));		
			}
			else {
				this.log("NodeMCU: " + this.characteristics[index] + " is invalid");
				delete this.characteristics[index];
			}
		}
	}
	else
		this.log("NodeMCU: please set characteristics field in config file");

	if (this.update_interval > 0) {
		this.timer = setInterval(this.updateState.bind(this), this.update_interval);
	}

	function charcHelper(name){
		return {
			getState: function (callback) {
				this.updateState(); //This sets the promise in last_value
				this.last_value.then((value) => {
					callback(null, value[name]);
					return value;
				}, (error) => {
					callback(error, null);
					return error;
				});
			},

			setState: function (state, callback) {
				this.updateState(name + "=" + state); //This sets the promise in last_value
				this.last_value.then((value) => {
					callback(null, value[name]);
					return value;
				}, (error) => {
					callback(error, null);
					return error;
				});
			},
		};
	}

	return [this.informationService, this.mservice];
}
