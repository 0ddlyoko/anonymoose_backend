const AWS = require('aws-sdk')
const db = new AWS.DynamoDB({ region: 'eu-west-3' })
const { request, authorizer } = require('common');
const { v4: uuidv4 } = require("uuid");

const userToJson = user => {
    return {
        "id": user.id.S,
        "name": user.name.S,
        "email": user.email.S,
        "firstConnection": user.firstConnection ? user.firstConnection.N : 0,
    };
};

const getEmailPromise = email => {
    return db.query({
        TableName: "User",
        IndexName: "EmailIndex",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
            ":email": {S: email},
        },
    }).promise();
}

const getNamePromise = name => {
    return db.query({
        TableName: "User",
        IndexName: "NameIndex",
        KeyConditionExpression: "#key = :username", // "name" is a reserved keyword
        ExpressionAttributeNames: {
            "#key": "name",
        },
        ExpressionAttributeValues: {
            ":username": {S: name},
        },
    }).promise();
}

exports.getProfile = (event, ctx, callback) => {
    console.info('getProfile', 'received: ', event);

    const email = authorizer.getEmail(event);
    if (!email) {
        callback(null, request.makeErrorRequest(400, "Invalid authorizer"));
        return;
    }

    getEmailPromise(email).then(data => {
            if (data.Items.length === 0)
                return request.makeErrorRequest(404, "Profile not found");
            if (data.Items.length > 1)
                return request.makeErrorRequest(400, "Multiple account with same email detected. Please contact an administrator");
            return request.makeRequest(200, userToJson(data.Items.pop()));
        })
        .catch(ex => request.makeServerErrorRequest("exports.getProfile", ex))
        .then(data => callback(null, data));
};

exports.postProfile = (event, ctx, callback) => {
    console.info('postProfile', 'received: ', event);

    const email = authorizer.getEmail(event);
    const name = authorizer.getName(event);
    if (!email || !name) {
        callback(null, request.makeErrorRequest(401, "Invalid authorizer"));
        return;
    }

    const emailPromise = getEmailPromise(email).then(data => data.Items.length !== 0).catch(() => true);
    const namePromise = getNamePromise(name).then(data => data.Items.length !== 0).catch(() => true);

    Promise.all([emailPromise, namePromise]).then(v => {
        const emailExist = v[0];
        const nameExist = v[1];
        if (emailExist || nameExist)
            return request.makeErrorRequest(409, "Name or Email already exist");

        const item = {
            id: {S: uuidv4()},
            name: {S: name},
            email: {S: email},
            firstConnection: {N: new Date().getTime().toString()},
        };
        return db.putItem({
            TableName: "User",
            Item: item,
        })
            .promise()
            .then(_ => request.makeRequest(200, userToJson(item)))
    })
        .catch(ex => request.makeServerErrorRequest("exports.postProfile", ex))
        .then(data => callback(null, data));
};
