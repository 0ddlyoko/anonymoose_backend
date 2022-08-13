const TABLE_NAME = process.env.TABLE_NAME

const dynamodb = require('aws-sdk/clients/dynamodb')
const db = new dynamodb.DocumentClient()
const common = require('common')

const userToJson = user => {
    return {
        "id": user.id,
        "name": user.name,
        "firstConnection": user.firstConnection ?? 0,
    }
}

exports.getAll = (event, ctx, callback) => {
    console.info('getAll', 'received: ', event);

    db.scan({
        TableName: TABLE_NAME,
    })
        .promise()
        .then(data => {
            return common.makeRequest(200, {
                count: data.Count,
                items: data.Items.map(d => userToJson(d)),
            })
        })
        .then(data => callback(null, data))
        .catch(ex => callback(null, common.makeServerErrorRequest(ex, "exports.getAll")));
}

exports.getOne = (event, ctx, callback) => {
    console.info('getOne', 'received: ', event);

    const id = event.pathParameters.id;
    // This should be an uuid
    if (!common.isUuid(id)) {
        callback(null, common.makeErrorRequest(400, "Please enter a valid uuid"))
        return
    }

    db.get({
        TableName: TABLE_NAME,
        Key: {
            id: id,
        },
    })
        .promise()
        .then(data => {
            if (!data.Item)
                return common.makeErrorRequest(404, "User not found")
            return common.makeRequest(200, userToJson(data.Item))
        })
        .then(data => callback(null, data))
        .catch(ex => callback(null, common.makeServerErrorRequest(ex, "exports.getAll")));
}
