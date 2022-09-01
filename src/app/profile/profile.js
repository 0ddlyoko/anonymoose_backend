const TABLE_USER = process.env.TABLE_USER;
const TABLE_USER_EMAIL_IDX = process.env.TABLE_USER_EMAIL_IDX;
const TABLE_USER_NAME_IDX = process.env.TABLE_USER_NAME_IDX;

const AWS = require('aws-sdk')
const db = new AWS.DynamoDB({ region: 'eu-west-3' })
const common = require('common');
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
        TableName: TABLE_USER,
        IndexName: TABLE_USER_EMAIL_IDX,
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
            ":email": {
                S: email,
            },
        },
    }).promise();
}

const getNamePromise = name => {
    return db.query({
        TableName: TABLE_USER,
        IndexName: TABLE_USER_NAME_IDX,
        KeyConditionExpression: "#key = :username", // "name" is a reserved keyword
        ExpressionAttributeNames: {
            "#key": "name",
        },
        ExpressionAttributeValues: {
            ":username": {
                S: name,
            },
        },
    }).promise();
}

exports.getProfile = (event, ctx, callback) => {
    console.info('getProfile', 'received: ', event);

    if (!event.requestContext.authorizer || !event.requestContext.authorizer.claims) {
        callback(null, common.makeErrorRequest(400, "Invalid authorizer"));
        return;
    }
    const claims = event.requestContext.authorizer.claims;
    const email = claims.email;
    if (!email) {
        callback(null, common.makeErrorRequest(400, "Invalid authorizer"));
        return;
    }

    getEmailPromise(email).then(data => {
            if (data.Items.length === 0)
                return common.makeErrorRequest(404, "Profile not found");
            if (data.Items.length > 1)
                return common.makeErrorRequest(400, "Multiple account with same email detected. Please contact an administrator");
            return common.makeRequest(200, userToJson(data.Items.pop()));
        })
        .catch(ex => common.makeServerErrorRequest("exports.getProfile", ex))
        .then(data => callback(null, data));
};

exports.postProfile = (event, ctx, callback) => {
    console.info('postProfile', 'received: ', event);

    if (!event.requestContext.authorizer || !event.requestContext.authorizer.claims) {
        callback(null, common.makeErrorRequest(401, "Invalid authorizer"));
        return;
    }
    const claims = event.requestContext.authorizer.claims;
    const email = claims.email;
    const name = claims["cognito:username"];
    if (!email || !name) {
        callback(null, common.makeErrorRequest(401, "Invalid authorizer"));
        return;
    }

    const emailPromise = getEmailPromise(email).then(data => data.Items.length !== 0).catch(() =>  true);
    const namePromise = getNamePromise(name).then(data => data.Items.length !== 0).catch(() => true);

    Promise.all([emailPromise, namePromise]).then(v => {
        const emailExist = v[0];
        const nameExist = v[1];
        if (emailExist || nameExist)
            return common.makeErrorRequest(409, "Name or Email already exist");

        const item = {
            id: {S: uuidv4()},
            name: {S: name},
            email: {S: email},
            firstConnection: {N: new Date().getTime().toString()},
        };
        return db.putItem({
            TableName: TABLE_USER,
            Item: item,
        })
            .promise()
            .then(_ => common.makeRequest(200, userToJson(item)))
    })
        .catch(ex => common.makeServerErrorRequest("exports.postProfile", ex))
        .then(data => callback(null, data));
};
