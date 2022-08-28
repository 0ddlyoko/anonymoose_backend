const TABLE_USER = process.env.TABLE_USER;
const TABLE_USER_EMAIL_IDX = process.env.TABLE_USER_EMAIL_IDX;

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

    db.query({
        TableName: TABLE_USER,
        IndexName: TABLE_USER_EMAIL_IDX,
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
            ":email": email,
        },
    })
        .promise()
        .then(data => {
            if (!data.Items)
                return common.makeErrorRequest(404, "Profile not found");
            if (data.Items.length > 1)
                return common.makeErrorRequest(400, "Multiple account with same email detected. Please contact an administrator");
            return common.makeRequest(200, userToJson(data.Items.pop()));
        })
        .catch(ex => common.makeServerErrorRequest(ex, "exports.getProfile"))
        .then(data => callback(null, data));
};

exports.postProfile = (event, ctx, callback) => {
    console.info('postProfile', 'received: ', event);

    if (!event.requestContext.authorizer || !event.requestContext.authorizer.claims) {
        callback(null, common.makeErrorRequest(400, "Invalid authorizer"));
        return;
    }
    const claims = event.requestContext.authorizer.claims;
    const email = claims.email;
    const name = claims.get("cognito:username");
    if (!email || !name) {
        callback(null, common.makeErrorRequest(400, "Invalid authorizer"));
        return;
    }

    const item = {
        id: {S: uuidv4()},
        name: {S: name},
        email: {S: email},
        firstConnection: {N: new Date().getTime().toString()},
        selfRegister: {BOOL: true},
    };
    db.putItem({
        TableName: TABLE_USER,
        Item: item,
        ConditionExpression: "",
    })
        .promise()
        .then(_ => common.makeRequest(200, userToJson(item)))
        .catch(ex => common.makeServerErrorRequest(ex, "exports.postProfile"))
        .then(data => callback(null, data));
};
