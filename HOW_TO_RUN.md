# How to create & run the backend server

## Deploy SAM

### IAM
1. Create a new IAM group with permission that you can find in iam_group_permission.json file
2. Create a new IAM user with group created previously

### SAM
1. Delete the samconfig.toml file
2. Run `sam deploy --guided` and let you guided
3. Configure Cognito
