const AWS = require('aws-sdk')
const db = new AWS.DynamoDB({ region: 'eu-west-3' })
const { request } = require('common');
const { validate: isUuid } = require("uuid");

const userToJson = user => {
    return {
        "id": user.id.S,
        "name": user.name.S,
        "email": user.email.S,
        "firstConnection": user.firstConnection ? parseInt(user.firstConnection.N) : 0,
    };
};

exports.getUsers = (event, ctx, callback) => {
    console.info('getUsers', 'received: ', event);

    let limit = 20;
    if (event.queryStringParameters)
        limit = Math.min(limit, Math.max(1, event.queryStringParameters.limit)) || limit;

    db.scan({
        TableName: "User",
        Limit: limit,
    })
        .promise()
        .then(data => request.makeRequest(200, {
            count: data.Count,
            items: data.Items.map(d => userToJson(d)),
        }))
        .catch(ex => request.makeServerErrorRequest(ex, "exports.getAll"))
        .then(data => callback(null, data));
};

exports.getUser = (event, ctx, callback) => {
    console.info('getUser', 'received: ', event);

    const userId = event.pathParameters.userId;
    // This should be an uuid
    if (!isUuid(userId)) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    db.getItem({
        TableName: "User",
        Key: {
            id: {S: userId},
        },
    })
        .promise()
        .then(data => {
            if (!data.Item)
                return request.makeErrorRequest(404, "User not found");
            return request.makeRequest(200, userToJson(data.Item));
        })
        .catch(ex => request.makeServerErrorRequest(ex, "exports.getUser"))
        .then(data => callback(null, data));
};
