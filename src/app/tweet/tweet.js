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
    };
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

    const id = event.pathParameters.tweetId;
    // This should be an uuid
    if (!isUuid(id)) {
        callback(null, request.makeErrorRequest(400, "Please enter a valid uuid"));
        return;
    }

    db.getItem({
        TableName: "Tweet",
        Key: {
            id: {S: id},
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
    authorizer.getUser(event, db).then(data => {
        if (data.Items.length === 0)
            return request.makeErrorRequest(404, "Profile not found");
        const user = data.Items[0];

        const item = {
            id: {S: uuidv4()},
            title: {S: title},
            text: {S: text},
            author: {S: user.id.S},
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
