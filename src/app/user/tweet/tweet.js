const AWS = require('aws-sdk')
const db = new AWS.DynamoDB({ region: 'eu-west-3' })
const { request } = require('common');
const {validate: isUuid} = require("uuid");

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

exports.getUserTweets = (event, ctx, callback) => {
    console.info('getUserTweets', 'received: ', event);

    let limit = 20;
    let comment = false;
    if (event.queryStringParameters) {
        limit = Math.min(limit, Math.max(1, event.queryStringParameters.limit)) || limit;
        comment = event.queryStringParameters.comment || comment;
    }
    const userId = event.pathParameters.userId;
    if (!isUuid(userId)) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    db.query({
        TableName: "Tweet",
        Limit: limit,
        IndexName: "AuthorIndex",
        KeyConditionExpression: "author = :author",
        FilterExpression: "(attribute_not_exists(hideAuthor) OR hideAuthor = :true)" + (comment ? "" : " AND attribute_not_exists(parent)"),
        ExpressionAttributeValues: {
            ":author": {S: userId},
            ":true": {BOOL: true},
        },
    })
        .promise()
        .then(data => Promise.all(data.Items.map(d => tweetToJson(d))))
        .then(data => request.makeRequest(200, {
            count: data.length,
            items: data,
        }))
        .catch(ex => request.makeServerErrorRequest(ex, "exports.getUserTweets"))
        .then(data => callback(null, data));
};
