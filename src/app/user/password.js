const TABLE_USER = process.env.TABLE_USER;

const AWS = require('aws-sdk')
const db = new AWS.DynamoDB({ region: 'eu-west-3' })
const common = require('common');
const { v4: uuidv4, validate: isUuid } = require("uuid");

exports.postUserPassword = (event, ctx, callback) => {
    console.info('postUserPassword', 'received: ', event);

    const id = event.pathParameters.id;
    // This should be an uuid
    if (!isUuid(id)) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    if (!event.body) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid JSON object"));
        return;
    }

    let body = "";
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid JSON object"));
        return;
    }
    const { token, password, password2 } = body;
    if (!token || !password || !password2) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid JSON object"));
        return;
    }
    callback(null, common.makeRequest(200, "{}"));
    // TODO
};

exports.postUserResetPassword = (event, ctx, callback) => {
    console.info('postUserResetPassword', 'received: ', event);

    const id = event.pathParameters.id;
    // This should be an uuid
    if (!isUuid(id)) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    callback(null, common.makeRequest(200, "{}"));
    // TODO
};

exports.postResetPassword = (event, ctx, callback) => {
    console.info('postResetPassword', 'received: ', event);

    if (!event.body) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid JSON object"));
        return;
    }

    let body = "";
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid JSON object"));
        return;
    }
    const { email } = body;
    if (!email) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid JSON object"));
        return;
    }
    callback(null, common.makeRequest(200, "{}"));
};
