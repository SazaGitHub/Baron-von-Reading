const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;

// Initialize persistent directories in the OS user's local app data path
const userDataPath = app.getPath("userData");
const dbPath = path.join(userDataPath, "db.sqlite");
const dataDir = path.join(userDataPath, "books");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Set environment variables for the backend to use
process.env["DB_PATH"] = dbPath;
process.env["DATA_DIR"] = dataDir;
// Bind the local backend server to an ephemeral free port
process.env["PORT"] = "0"; 
// Serve compiled frontend files directly
process.env["PUBLIC_DIR"] = path.join(__dirname, "frontend/dist");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "Baron von Reading",
    autoHideMenuBar: true,
  });

  // Load the Node.js backend server
  // This initializes the server and starts listening
  const backend = require("./backend/dist/index.js");
  const server = backend.server;
  
  // Wait for the backend server to bind to a dynamic port
  const checkPortAndLoad = () => {
    const address = server.address();
    if (address && address.port) {
      const url = `http://localhost:${address.port}`;
      console.log(`Backend is listening on ${url}, loading in Electron...`);
      mainWindow.loadURL(url);
    } else {
      setTimeout(checkPortAndLoad, 50);
    }
  };

  checkPortAndLoad();

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

app.on("ready", createWindow);

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  }
});
