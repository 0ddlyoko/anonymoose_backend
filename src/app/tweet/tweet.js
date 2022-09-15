const AWS = require('aws-sdk')
const db = new AWS.DynamoDB({ region: 'eu-west-3' })
const { request, authorizer } = require('common');
const { validate: isUuid, v4: uuidv4 } = require("uuid");

const tweetToJson = tweet => {
    const author = {
        hidden: tweet.hideAuthor.BOOL,
    };
    if (author.hidden) {
        author["name"] = "Hidden";
        author["picture"] = "https://cdn.anonymoose.com/u/hidden.png";
    } else {
        const id = tweet.author.S;
        author["id"] = id;
        author["picture"] = `https://cdn.anonymoose.com/u/${id}.png`;
    }
    const result = {
        "id": tweet.id.S,
        "title": tweet.title.S,
        "text": tweet.text.S,
        "author": author,
        "comments": {
            "size": tweet.commentSize ? tweet.commentSize.N : 0,
        },
    };
    if (tweet.parent)
        result["parent"] = tweet.parent.S;
    if (author.hidden)
        return new Promise((resolve) => {
            resolve(result);
        });
    return db.getItem({
        TableName: "User",
        Key: {
            id: {S: result["author"]["id"]},
        },
    })
        .promise()
        .then(data => {
            result["author"]["name"] = data.Item ? data.Item.name.S : "Unknown";
            return result;
        }).catch(ex => {
            console.error(ex);
            result["author"]["name"] = "Unknown";
            return result;
        });
};

exports.getTweets = (event, ctx, callback) => {
    console.info('getTweets', 'received: ', event);

    let limit = 20;
    if (event.queryStringParameters)
        limit = Math.min(limit, Math.max(1, event.queryStringParameters.limit)) || limit;

    db.scan({
        TableName: "Tweet",
        Limit: limit,
    })
        .promise()
        .then(data => Promise.all(data.Items.map(d => tweetToJson(d))))
        .then(data => request.makeRequest(200, {
            count: data.length,
            items: data,
        }))
        .catch(ex => request.makeServerErrorRequest(ex, "exports.getTweets"))
        .then(data => callback(null, data));
};

exports.getTweet = (event, ctx, callback) => {
    console.info('getTweet', 'received: ', event);

    const tweetId = event.pathParameters.tweetId;
    // This should be an uuid
    if (!isUuid(tweetId)) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    db.getItem({
        TableName: "Tweet",
        Key: {
            id: {S: tweetId},
        },
    })
        .promise()
        .then(data => data.Item ? tweetToJson(data.Item) : null)
        .then(data => {
            if (!data)
                return request.makeErrorRequest(404, "Tweet not found");
            return request.makeRequest(200, data);
        })
        .catch(ex => request.makeServerErrorRequest(ex, "exports.getTweet"))
        .then(data => callback(null, data));
};

exports.postTweet = (event, ctx, callback) => {
    console.info('postTweet', 'received: ', event);

    if (!event.body) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid body"));
        return;
    }
    let { title, text, author } = JSON.parse(event.body);
    if (!title || !text) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid body"));
        return;
    }
    const hideAuthor = author === undefined || author.hidden;
    authorizer.getUser(event, db)
        .catch(() => request.makeErrorRequest(404, "Invalid authorizer"))
        .then(data => {
            // Check if the previous catch has been executed
            if (!data.id)
                return data;

            const item = {
                id: {S: uuidv4()},
                title: {S: title},
                text: {S: text},
                author: {S: data.id.S},
                hideAuthor: {BOOL: hideAuthor},
            };
            return db.putItem({
                TableName: "Tweet",
                Item: item,
            })
                .promise()
                .then(_ => tweetToJson(item))
                .then(data => request.makeRequest(200, data))
        })
        .catch(() => request.makeErrorRequest(400, "Invalid authorizer"))
        .then(data => callback(null, data));
};

exports.getTweetComments = (event, ctx, callback) => {
    console.info('getTweetComments', 'received: ', event);

    let limit = 20;
    if (event.queryStringParameters)
        limit = Math.min(limit, Math.max(1, event.queryStringParameters.limit)) || limit;

    const tweetId = event.pathParameters.tweetId;
    // This should be an uuid
    if (!isUuid(tweetId)) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    db.query({
        TableName: "Tweet",
        Limit: limit,
        IndexName: "ParentIndex",
        KeyConditionExpression: "parent = :parent",
        ExpressionAttributeValues: {
            ":parent": {S: tweetId},
        }
    })
        .promise()
        .then(data => Promise.all(data.Items.map(d => tweetToJson(d))))
        .then(data => request.makeRequest(200, {
            count: data.length,
            items: data,
        }))
        .catch(ex => request.makeServerErrorRequest(ex, "exports.getTweetComments"))
        .then(data => callback(null, data));
};

exports.postTweetComment = (event, ctx, callback) => {
    console.info('postTweetComment', 'received: ', event);

    const tweetId = event.pathParameters.tweetId;
    // This should be an uuid
    if (!isUuid(tweetId)) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    if (!event.body) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid body"));
        return;
    }
    let { title, text, author } = JSON.parse(event.body);
    if (!title || !text) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid body"));
        return;
    }
    const hideAuthor = author === undefined || author.hidden;

    const item = {
        id: {S: uuidv4()},
        title: {S: title},
        text: {S: text},
        hideAuthor: {BOOL: hideAuthor},
        parent: {S: tweetId},
    };
    authorizer.getUser(event, db)
        .catch(ex => request.makeErrorRequest(400, ex))
        .then(data => {
            // Check if the previous catch has been executed
            if (!data.id)
                return data;
            item['author'] = {S: data.id.S}
            return db.putItem({
                TableName: "Tweet",
                Item: item,
            }).promise()
        })
        .then(_ => {
            // Add one to "commentSize"
            // If there is an error, ignore it
            return db.updateItem({
                TableName: "Tweet",
                Key: {
                    id: {S: tweetId},
                },
                UpdateExpression: "SET commentSize = if_not_exists(commentSize, :zero) + :one",
                ExpressionAttributeValues: {
                    ":zero": {N: "0"},
                    ":one": {N: "1"},
                }
            }).promise()
                .catch(ex => console.error(ex))
        })
        .then(_ => tweetToJson(item))
        .then(data => request.makeRequest(200, data))
        .catch(ex => request.makeServerErrorRequest(ex, "exports.postTweetComment"))
        .then(data => callback(null, data));
};
