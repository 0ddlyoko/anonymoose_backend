const TABLE_USER = process.env.TABLE_USER;

const AWS = require('aws-sdk')
const db = new AWS.DynamoDB({ region: 'eu-west-3' })
const common = require('common');
const { v4: uuidv4, validate: isUuid } = require("uuid");

const userToJson = user => {
    return {
        "id": user.id.S,
        "name": user.name.S,
        "email": user.email.S,
        "firstConnection": user.firstConnection ? user.firstConnection.N : 0,
    };
};

exports.getAll = (event, ctx, callback) => {
    console.info('getAll', 'received: ', event);

    db.scan({
        TableName: TABLE_USER,
    })
        .promise()
        .then(data => {
            return common.makeRequest(200, {
                count: data.Count,
                items: data.Items.map(d => userToJson(d)),
            });
        })
        .catch(ex => common.makeServerErrorRequest(ex, "exports.getAll"))
        .then(data => callback(null, data));
};

exports.getOne = (event, ctx, callback) => {
    console.info('getOne', 'received: ', event);

    const id = event.pathParameters.id;
    // This should be an uuid
    if (!isUuid(id)) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    db.getItem({
        TableName: TABLE_USER,
        Key: {
            id: {S: id},
        },
    })
        .promise()
        .then(data => {
            if (!data.Item)
                return common.makeErrorRequest(404, "User not found");
            return common.makeRequest(200, userToJson(data.Item));
        })
        .catch(ex => {
            return common.makeServerErrorRequest(ex, "exports.getOne")
        })
        .then(data => callback(null, data));
};

exports.postOne = (event, ctx, callback) => {
    console.info('postOne', 'received: ', event);

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
    const { name, email } = body;
    if (!name || !email) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid JSON object"));
        return;
    }
    const item = {
        id: {S: uuidv4()},
        name: {S: name},
        email: {S: email},
        firstConnection: {N: new Date().getTime().toString()},
    };
    db.putItem({
        TableName: TABLE_USER,
        Item: item,
    })
        .promise()
        .then(_ => common.makeRequest(200, userToJson(item)))
        .catch(ex => common.makeServerErrorRequest(ex, "exports.postOne"))
        .then(data => callback(null, data));
};
