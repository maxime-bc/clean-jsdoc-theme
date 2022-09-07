http_server_address="127.0.0.1"
http_server_port=8080

npm run build

# run an http-server to serve the documentation
# this command is ran in background, as we need to launch cypress
npx http-server ./output/v4/ --port $http_server_port -a $http_server_address --silent &

# export the base URL of the documentation so that we can visit it with Cypress.
# Cypress will remove the CYPRESS_ prefix

export CYPRESS_VISIT_URL="http://${http_server_address}:${http_server_port}/"

if [ "$1" = "headless" ]; then
  cypress run --e2e --browser firefox --"$1"
elif [ "$1" = "headed" ]; then
  cypress open
else
  echo "Invalid param : $1."
fi

# after Cypress is done, kill the http-server.
pkill http-server