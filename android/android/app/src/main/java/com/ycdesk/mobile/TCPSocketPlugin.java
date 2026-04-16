package com.ycdesk.mobile;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.UnknownHostException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TCPSocket")
public class TCPSocketPlugin extends Plugin {
    private static final String TAG = "TCPSocketPlugin";
    private ServerSocket serverSocket;
    private final Map<String, Socket> clientSockets = new HashMap<>();
    private final Map<String, BufferedReader> readers = new HashMap<>();
    private final Map<String, PrintWriter> writers = new HashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private boolean isServerRunning = false;

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", 8080);
        
        executor.execute(() -> {
            try {
                if (serverSocket != null && !serverSocket.isClosed()) {
                    serverSocket.close();
                }
                
                serverSocket = new ServerSocket(port);
                isServerRunning = true;
                
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("port", port);
                call.resolve(result);
                
                Log.d(TAG, "Server started on port: " + port);
                
                while (isServerRunning && !serverSocket.isClosed()) {
                    try {
                        Socket clientSocket = serverSocket.accept();
                        String clientId = generateClientId();
                        clientSockets.put(clientId, clientSocket);
                        readers.put(clientId, new BufferedReader(new InputStreamReader(clientSocket.getInputStream())));
                        writers.put(clientId, new PrintWriter(clientSocket.getOutputStream(), true));
                        
                        JSObject event = new JSObject();
                        event.put("clientId", clientId);
                        event.put("remoteAddress", clientSocket.getInetAddress().getHostAddress());
                        event.put("remotePort", clientSocket.getPort());
                        notifyListeners("incomingConnection", event);
                        
                        startReading(clientId);
                        
                        Log.d(TAG, "Client connected: " + clientId);
                    } catch (Exception e) {
                        if (isServerRunning) {
                            Log.e(TAG, "Error accepting client: " + e.getMessage());
                        }
                    }
                }
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.resolve(result);
                Log.e(TAG, "Error starting server: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        executor.execute(() -> {
            try {
                isServerRunning = false;
                if (serverSocket != null && !serverSocket.isClosed()) {
                    serverSocket.close();
                }
                
                for (String clientId : clientSockets.keySet()) {
                    closeClient(clientId);
                }
                clientSockets.clear();
                readers.clear();
                writers.clear();
                
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                
                Log.d(TAG, "Server stopped");
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.resolve(result);
                Log.e(TAG, "Error stopping server: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 8080);
        
        if (host == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Host is required");
            call.resolve(result);
            return;
        }
        
        executor.execute(() -> {
            try {
                String clientId = generateClientId();
                Socket socket = new Socket(host, port);
                clientSockets.put(clientId, socket);
                readers.put(clientId, new BufferedReader(new InputStreamReader(socket.getInputStream())));
                writers.put(clientId, new PrintWriter(socket.getOutputStream(), true));
                
                startReading(clientId);
                
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("clientId", clientId);
                call.resolve(result);
                
                Log.d(TAG, "Connected to " + host + ":" + port);
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.resolve(result);
                Log.e(TAG, "Error connecting: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void send(PluginCall call) {
        String clientId = call.getString("clientId");
        String message = call.getString("message");
        
        if (clientId == null || message == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "clientId and message are required");
            call.resolve(result);
            return;
        }
        
        executor.execute(() -> {
            try {
                PrintWriter writer = writers.get(clientId);
                if (writer != null) {
                    writer.println(message);
                    
                    JSObject result = new JSObject();
                    result.put("success", true);
                    call.resolve(result);
                } else {
                    JSObject result = new JSObject();
                    result.put("success", false);
                    result.put("error", "Client not found");
                    call.resolve(result);
                }
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.resolve(result);
                Log.e(TAG, "Error sending message: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String clientId = call.getString("clientId");
        
        if (clientId == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "clientId is required");
            call.resolve(result);
            return;
        }
        
        executor.execute(() -> {
            closeClient(clientId);
            
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void resolveDns(PluginCall call) {
        String hostname = call.getString("hostname");
        
        if (hostname == null || hostname.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Hostname is required");
            call.resolve(result);
            return;
        }
        
        executor.execute(() -> {
            try {
                InetAddress address = InetAddress.getByName(hostname);
                String ipAddress = address.getHostAddress();
                String originalHost = address.getHostName();
                
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("ipAddress", ipAddress);
                result.put("hostname", originalHost);
                result.put("isResolved", !ipAddress.equals(hostname));
                call.resolve(result);
                
                Log.d(TAG, "DNS resolved: " + hostname + " -> " + ipAddress);
            } catch (UnknownHostException e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "DNS resolution failed: " + e.getMessage());
                call.resolve(result);
                Log.e(TAG, "DNS resolution failed for " + hostname + ": " + e.getMessage());
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.resolve(result);
                Log.e(TAG, "Error resolving DNS: " + e.getMessage());
            }
        });
    }

    private void startReading(String clientId) {
        executor.execute(() -> {
            try {
                BufferedReader reader = readers.get(clientId);
                if (reader == null) return;
                
                String line;
                while ((line = reader.readLine()) != null) {
                    JSObject event = new JSObject();
                    event.put("clientId", clientId);
                    event.put("message", line);
                    notifyListeners("message", event);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error reading from client " + clientId + ": " + e.getMessage());
            } finally {
                closeClient(clientId);
                
                JSObject event = new JSObject();
                event.put("clientId", clientId);
                notifyListeners("disconnected", event);
            }
        });
    }

    private void closeClient(String clientId) {
        try {
            PrintWriter writer = writers.get(clientId);
            if (writer != null) {
                writer.close();
                writers.remove(clientId);
            }
            
            BufferedReader reader = readers.get(clientId);
            if (reader != null) {
                reader.close();
                readers.remove(clientId);
            }
            
            Socket socket = clientSockets.get(clientId);
            if (socket != null && !socket.isClosed()) {
                socket.close();
                clientSockets.remove(clientId);
            }
            
            Log.d(TAG, "Client closed: " + clientId);
        } catch (Exception e) {
            Log.e(TAG, "Error closing client: " + e.getMessage());
        }
    }

    private String generateClientId() {
        return Long.toHexString(System.currentTimeMillis()) + Integer.toHexString((int)(Math.random() * 0xFFFF));
    }
}
