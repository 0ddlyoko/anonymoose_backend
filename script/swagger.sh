#!/bin/sh
# Transform the swagger api into a single file usable by AWS

swagger-cli bundle ../swagger/api.yaml --outfile ../api.yaml --type yaml
