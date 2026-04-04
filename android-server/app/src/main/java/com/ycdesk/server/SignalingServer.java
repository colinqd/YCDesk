package com.ycdesk.server;

import android.util.Log;
import org.nanohttpd.protocols.http.IHTTPSession;
import org.nanohttpd.protocols.http.response.Response;
import org.nanohttpd.protocols.websockets.NanoWSD;
import org.nanohttpd.protocols.websockets.WebSocket;
import org.nanohttpd.protocols.websockets.WebSocketFrame;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONObject;
import org.json.JSONException;

public class SignalingServer extends NanoWSD {

    private static final String TAG = "SignalingServer";
    
    private final int port;
    private final boolean useHttps;
    
    private final Map<String, WebSocket> deviceSockets = new ConcurrentHashMap<>();
    private final Map<String, String> socketToDevice = new ConcurrentHashMap<>();
    private final Map<String, SessionInfo> sessions = new ConcurrentHashMap<>();

    public SignalingServer(int port, boolean useHttps) {
        super(port);
        this.port = port;
        this.useHttps = useHttps;
        Log.d(TAG, "SignalingServer created on port: " + port);
    }

    @Override
    protected WebSocket openWebSocket(IHTTPSession handshake) {
        return new SignalingWebSocket(handshake);
    }

    private class SignalingWebSocket extends WebSocket {

        private String deviceId;

        public SignalingWebSocket(IHTTPSession handshakeRequest) {
            super(handshakeRequest);
        }

        @Override
        protected void onOpen() {
            Log.d(TAG, "WebSocket opened");
        }

        @Override
        protected void onClose(WebSocketFrame.CloseCode code, String reason, boolean initiatedByRemote) {
            Log.d(TAG, "WebSocket closed: " + reason);
            if (deviceId != null) {
                deviceSockets.remove(deviceId);
                socketToDevice.remove(this.hashCode());
            }
        }

        @Override
        protected void onMessage(WebSocketFrame message) {
            try {
                String payload = message.getTextPayload();
                Log.d(TAG, "Received: " + payload);
                JSONObject json = new JSONObject(payload);
                handleMessage(json);
            } catch (Exception e) {
                Log.e(TAG, "Error handling message", e);
            }
        }

        @Override
        protected void onPong(WebSocketFrame pong) {
        }

        @Override
        protected void onException(IOException exception) {
            Log.e(TAG, "WebSocket exception", exception);
        }

        private void handleMessage(JSONObject json) throws JSONException {
            String type = json.optString("type");
            
            switch (type) {
                case "register":
                    handleRegister(json);
                    break;
                case "connect-request":
                    handleConnectRequest(json);
                    break;
                case "connection-response":
                    handleConnectionResponse(json);
                    break;
                case "offer":
                    handleOffer(json);
                    break;
                case "answer":
                    handleAnswer(json);
                    break;
                case "ice-candidate":
                    handleIceCandidate(json);
                    break;
            }
        }

        private void handleRegister(JSONObject json) throws JSONException {
            deviceId = json.getString("deviceId");
            deviceSockets.put(deviceId, this);
            socketToDevice.put(this.hashCode(), deviceId);
            Log.d(TAG, "Device registered: " + deviceId);
        }

        private void handleConnectRequest(JSONObject json) throws JSONException {
            String fromDeviceId = json.getString("fromDeviceId");
            String toDeviceId = json.getString("toDeviceId");
            
            WebSocket targetSocket = deviceSockets.get(toDeviceId);
            
            if (targetSocket != null) {
                String sessionId = generateSessionId();
                sessions.put(sessionId, new SessionInfo(fromDeviceId, toDeviceId));
                
                JSONObject response = new JSONObject();
                response.put("type", "incoming-connection");
                response.put("fromDeviceId", fromDeviceId);
                response.put("sessionId", sessionId);
                sendMessage(targetSocket, response);
                
                Log.d(TAG, "Connect request: " + fromDeviceId + " -> " + toDeviceId);
            } else {
                JSONObject response = new JSONObject();
                response.put("type", "connection-result");
                response.put("accepted", false);
                response.put("error", "Device not online");
                sendMessage(this, response);
            }
        }

        private void handleConnectionResponse(JSONObject json) throws JSONException {
            String sessionId = json.getString("sessionId");
            boolean accepted = json.getBoolean("accepted");
            String fromDeviceId = json.getString("fromDeviceId");
            String toDeviceId = json.getString("toDeviceId");
            
            SessionInfo session = sessions.get(sessionId);
            if (session != null) {
                WebSocket targetSocket = deviceSockets.get(fromDeviceId);
                if (targetSocket != null) {
                    JSONObject response = new JSONObject();
                    response.put("type", "connection-result");
                    response.put("accepted", accepted);
                    response.put("sessionId", sessionId);
                    response.put("fromDeviceId", session.fromDeviceId);
                    response.put("toDeviceId", session.toDeviceId);
                    sendMessage(targetSocket, response);
                }
            }
        }

        private void handleOffer(JSONObject json) throws JSONException {
            String sessionId = json.getString("sessionId");
            JSONObject offer = json.getJSONObject("offer");
            String toDeviceId = json.getString("toDeviceId");
            
            WebSocket targetSocket = deviceSockets.get(toDeviceId);
            if (targetSocket != null) {
                JSONObject response = new JSONObject();
                response.put("type", "offer");
                response.put("sessionId", sessionId);
                response.put("offer", offer);
                sendMessage(targetSocket, response);
            }
        }

        private void handleAnswer(JSONObject json) throws JSONException {
            String sessionId = json.getString("sessionId");
            JSONObject answer = json.getJSONObject("answer");
            String toDeviceId = json.getString("toDeviceId");
            
            WebSocket targetSocket = deviceSockets.get(toDeviceId);
            if (targetSocket != null) {
                JSONObject response = new JSONObject();
                response.put("type", "answer");
                response.put("sessionId", sessionId);
                response.put("answer", answer);
                sendMessage(targetSocket, response);
            }
        }

        private void handleIceCandidate(JSONObject json) throws JSONException {
            String sessionId = json.getString("sessionId");
            JSONObject candidate = json.getJSONObject("candidate");
            String toDeviceId = json.getString("toDeviceId");
            
            WebSocket targetSocket = deviceSockets.get(toDeviceId);
            if (targetSocket != null) {
                JSONObject response = new JSONObject();
                response.put("type", "ice-candidate");
                response.put("sessionId", sessionId);
                response.put("candidate", candidate);
                sendMessage(targetSocket, response);
            }
        }

        private void sendMessage(WebSocket socket, JSONObject json) {
            try {
                socket.send(json.toString());
            } catch (IOException e) {
                Log.e(TAG, "Error sending message", e);
            }
        }
    }

    private String generateSessionId() {
        return Long.toHexString(System.currentTimeMillis()).toUpperCase();
    }

    private static class SessionInfo {
        String fromDeviceId;
        String toDeviceId;

        SessionInfo(String from, String to) {
            this.fromDeviceId = from;
            this.toDeviceId = to;
        }
    }
}
