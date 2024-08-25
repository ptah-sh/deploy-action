const core = require("@actions/core");
const { HttpClient } = require("@actions/http-client");
const yaml = require("js-yaml");

function validateProcess(process, index) {
  if (typeof process !== 'object' || process === null) {
    throw new Error(`Process at index ${index} must be an object`);
  }

  if (typeof process.name !== 'string' || process.name.trim() === '') {
    throw new Error(`Process at index ${index} must have a non-empty 'name' string`);
  }

  if (process.dockerImage !== undefined) {
    if (typeof process.dockerImage !== 'string' || process.dockerImage.trim() === '') {
      throw new Error(`Process at index ${index} 'dockerImage' must be a non-empty string if provided`);
    }
    if (process.dockerImage.endsWith(':')) {
      throw new Error(`Process at index ${index} 'dockerImage' must not end with a colon (:)`);
    }
  }

  if (process.envVars && !Array.isArray(process.envVars)) {
    throw new Error(`Process at index ${index} 'envVars' must be an array if provided`);
  }

  if (process.envVars) {
    process.envVars.forEach((envVar, envIndex) => {
      if (typeof envVar !== 'object' || envVar === null) {
        throw new Error(`EnvVar at index ${envIndex} for process ${process.name} must be an object`);
      }
      
      if (typeof envVar.value !== 'string') {
        throw new Error(`EnvVar at index ${envIndex} for process ${process.name} must have a 'value' string`);
      }
    });
  }
}

async function run() {
  try {
    // Get inputs
    const apiKey = core.getInput("apiKey", { required: true });
    const service = core.getInput("service", { required: true });
    const processesYamlString = core.getInput("processes", { required: true });
    const serverAddress = core.getInput("serverAddress") || "https://ctl.ptah.sh";

    // Parse the processes YAML
    let processes;
    try {
      processes = yaml.load(processesYamlString);
    } catch (error) {
      throw new Error("Invalid YAML format for processes input");
    }

    // Validate the processes structure
    if (!Array.isArray(processes)) {
      throw new Error("Processes must be an array");
    }

    if (processes.length === 0) {
      throw new Error("Processes array must not be empty");
    }

    // Validate each process
    processes.forEach(validateProcess);

    console.log(`Deploying service: ${service}`);
    console.log(`Received ${processes.length} process(es) to deploy`);

    // Prepare the request payload
    const payload = {
      processes: processes
    };

    // Make the API call
    const http = new HttpClient('ptah-deploy-action');
    try {
      const response = await http.postJson(
        `${serverAddress}/api/v0/services/${service}/deploy`,
        payload,
        {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      );

      if (response.statusCode !== 200) {
        throw new Error(`API call failed with status ${response.statusCode}`);
      }

      const responseData = response.result;
      console.log("Deployment initiated successfully");
      console.log("API Response:", responseData);

      const deploymentId = responseData.deployment_id;
      if (!deploymentId) {
        throw new Error("Deployment ID not found in API response");
      }

      // There is no deployment page yet, so just form the link to the deployments page
      // const deploymentLink = `${serverAddress}/services/${service}/deployments/${deploymentId}`;
      const deploymentLink = `${serverAddress}/services/${service}/deployments`;

      console.log(`Deployment initiated successfully. Link: ${deploymentLink}`);
      
      // Set the output for the GitHub Action
      core.setOutput("deploymentId", deploymentId);
    } catch (error) {
      console.error("API Error:", error.message);
      throw new Error(`API call failed: ${error.message}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();