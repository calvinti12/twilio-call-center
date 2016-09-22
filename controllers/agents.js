'use strict'

const twilio = require('twilio')
const Client = require('authy-client').Client;
const client = new Client({key: process.env.AUTHY_API_KEY});

/* client for Twilio TaskRouter */
const taskrouterClient = new twilio.TaskRouterClient(
	process.env.TWILIO_ACCOUNT_SID,
	process.env.TWILIO_AUTH_TOKEN,
	process.env.TWILIO_WORKSPACE_SID)

module.exports.login = function (req, res) {
	console.log('login body', req.body);
	var friendlyName = req.body.worker.friendlyName

	/* all token we generate are valid for 1 hour */
	var lifetime = 3600

	taskrouterClient.workspace.workers.get({FriendlyName: friendlyName}, function (err, data) {
		if (err) {
			res.status(500).json(err)
			return
		}

		for (var i = 0; i < data.workers.length; i++) {
			var worker = data.workers[i]

			var info = JSON.parse(worker.attributes);
			console.log(info);
			if (worker.friendlyName === friendlyName) {
				if(info.authyId){
					res.status(200).json({authyId: info.authyId, worker: worker});
				} else {
					// createTokens(req, worker);

					/* create a token for taskrouter */
					var workerCapability = new twilio.TaskRouterWorkerCapability(
						process.env.TWILIO_ACCOUNT_SID,
						process.env.TWILIO_AUTH_TOKEN,
						process.env.TWILIO_WORKSPACE_SID, worker.sid)

					workerCapability.allowActivityUpdates()
					workerCapability.allowReservationUpdates()
					workerCapability.allowFetchSubresources()

					/* create a token for Twilio client */
					var phoneCapability = new twilio.Capability(
						process.env.TWILIO_ACCOUNT_SID,
						process.env.TWILIO_AUTH_TOKEN)

					phoneCapability.allowClientOutgoing(req.configuration.twilio.applicationSid)
					phoneCapability.allowClientIncoming(friendlyName.toLowerCase())

					/* create token for Twilio IP Messaging */
					var grant = new twilio.AccessToken.IpMessagingGrant({
						serviceSid: process.env.TWILIO_IPM_SERVICE_SID,
						endpointId: req.body.endpoint
					})

					var accessToken = new twilio.AccessToken(
						process.env.TWILIO_ACCOUNT_SID,
						process.env.TWILIO_API_KEY,
						process.env.TWILIO_API_SECRET,
						{ ttl: lifetime })

					accessToken.addGrant(grant)
					accessToken.identity = worker.friendlyName

					var tokens = {
						worker: workerCapability.generate(lifetime),
						phone: phoneCapability.generate(lifetime),
						chat: accessToken.toJwt()
					}

					req.session.tokens = tokens
					req.session.worker = worker
					res.status(200).json({authyId: false});
				}
				return
			}

		}
		res.status(404).end()

		return
	})
}

module.exports.logout = function (req, res) {

	req.session.destroy(function (err) {
		if (err) {
			res.status(500).json(err)
		} else {
			res.status(200).end()
		}
	})
}

function createTokens(req, worker){

}

module.exports.getSession = function (req, res) {
	if (!req.session.worker) {
		console.log('403 worker: ', req.session.worker);
		res.status(403).end()
	} else {
		console.log('worker: ', req.session.worker);

		res.status(200).json({
			tokens: req.session.tokens,
			worker: req.session.worker,
			configuration: {
				twilio: req.configuration.twilio
			}
		})

	}
}

module.exports.call = function (req, res) {
	var twiml = new twilio.TwimlResponse()

	twiml.dial({ callerId: req.configuration.twilio.callerId }, function (node) {
		node.number(req.query.phone)
	})

	res.setHeader('Content-Type', 'application/xml')
	res.setHeader('Cache-Control', 'public, max-age=0')
	res.send(twiml.toString())
}


module.exports.verifyToken = function (req, res) {
	var authyId = req.body.authyId;
	var token = req.body.token;
	var worker = req.body.worker;

	console.log('worker: ', worker);

	client.verifyToken({authyId: authyId, token: token}, function (err, authyResponse) {
		if (err) {
			console.log('Verify Token Error Response ', err)
			res.status(500).send({'error': err});
		} else if (!authyResponse.success) {
			console.log('token failure')
			res.status(500).json({"failure": "Token Invalid"})
		} else {

			var friendlyName = req.body.worker.friendlyName
			var lifetime = 3600

			/* create a token for taskrouter */
			var workerCapability = new twilio.TaskRouterWorkerCapability(
				process.env.TWILIO_ACCOUNT_SID,
				process.env.TWILIO_AUTH_TOKEN,
				process.env.TWILIO_WORKSPACE_SID, worker.sid)

			workerCapability.allowActivityUpdates()
			workerCapability.allowReservationUpdates()
			workerCapability.allowFetchSubresources()

			/* create a token for Twilio client */
			var phoneCapability = new twilio.Capability(
				process.env.TWILIO_ACCOUNT_SID,
				process.env.TWILIO_AUTH_TOKEN)

			phoneCapability.allowClientOutgoing(req.configuration.twilio.applicationSid)
			phoneCapability.allowClientIncoming(friendlyName.toLowerCase())

			/* create token for Twilio IP Messaging */
			var grant = new twilio.AccessToken.IpMessagingGrant({
				serviceSid: process.env.TWILIO_IPM_SERVICE_SID,
				endpointId: req.body.endpoint
			})

			var accessToken = new twilio.AccessToken(
				process.env.TWILIO_ACCOUNT_SID,
				process.env.TWILIO_API_KEY,
				process.env.TWILIO_API_SECRET,
				{ ttl: lifetime })

			accessToken.addGrant(grant)
			accessToken.identity = worker.friendlyName

			var tokens = {
				worker: workerCapability.generate(lifetime),
				phone: phoneCapability.generate(lifetime),
				chat: accessToken.toJwt()
			}

			req.session.tokens = tokens
			req.session.worker = worker
			console.log(req.session);
			res.status(200).json({"success": "Token Valid"})
		}
	});
};

module.exports.requestToken = function (req, res) {
	var authyId = req.body.authyId;
	var forceVal = Boolean(req.body.force) || false;
	console.log(authyId);
	console.log(forceVal);
	client.requestSms({authyId: authyId}, {force: forceVal}, function (err, authyres) {

		if (err) {
			console.log('error: ', err);
			res.status(500).json(err);
			return;
		}
		console.log("SMS Response: " + JSON.stringify(authyres));
		res.status(200).json({"success": "SMS Sent"});
	});
};




