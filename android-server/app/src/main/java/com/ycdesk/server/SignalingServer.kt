package com.ycdesk.server

import android.util.Log
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONObject
import java.net.InetSocketAddress
import java.util.Date
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class SignalingServer(private val port: Int, private val useHttps: Boolean) {

    companion object {
        private const val TAG = "SignalingServer"
        private const val SESSION_TIMEOUT_MS = 300000L
    }

    private var server: WebSocketServer? = null
    private val devices = ConcurrentHashMap<String, WebSocket>()
    private val sessions = ConcurrentHashMap<String, SessionInfo>()
    private val scheduler = Executors.newSingleThreadScheduledExecutor()

    var logCallback: ((String) -> Unit)? = null
    var deviceCountCallback: ((Int) -> Unit)? = null

    private fun log(message: String) {
        Log.d(TAG, message)
        logCallback?.invoke(message)
    }

    init {
        log("SignalingServer created on port: $port")
        startSessionCleanup()
    }

    private fun startSessionCleanup() {
        scheduler.scheduleAtFixedRate({
            try {
                val now = Date()
                sessions.entries.removeIf { (_, session) ->
                    val age = now.time - session.createdAt.time
                    if (age > SESSION_TIMEOUT_MS) {
                        log("清理过期会话")
                        true
                    } else {
                        false
                    }
                }
            } catch (e: Exception) {
                log("清理会话错误: ${e.message}")
            }
        }, 1, 1, TimeUnit.MINUTES)
    }

    fun start() {
        try {
            log("创建WebSocket服务器...")

            server = object : WebSocketServer(InetSocketAddress(port)) {
                override fun onOpen(conn: WebSocket?, handshake: ClientHandshake?) {
                    log("客户端连接: ${conn?.remoteSocketAddress}")
                }

                override fun onClose(conn: WebSocket?, code: Int, reason: String?, remote: Boolean) {
                    log("客户端断开: ${conn?.remoteSocketAddress}, 原因: $reason")

                    val deviceToRemove = devices.entries.find { it.value == conn }
                    if (deviceToRemove != null) {
                        devices.remove(deviceToRemove.key)
                        log("设备断开: ${deviceToRemove.key}")
                        deviceCountCallback?.invoke(devices.size)
                    }
                }

                override fun onMessage(conn: WebSocket?, message: String?) {
                    if (conn == null || message == null) return

                    log("收到消息: ${message.take(200)}")

                    try {
                        val json = JSONObject(message)
                        val type = json.optString("type")

                        when (type) {
                            "register" -> handleRegister(conn, json)
                            "connect-request" -> handleConnectRequest(conn, json)
                            "connection-response" -> handleConnectionResponse(conn, json)
                            "offer" -> handleOffer(conn, json)
                            "answer" -> handleAnswer(conn, json)
                            "ice-candidate" -> handleIceCandidate(conn, json)
                        }
                    } catch (e: Exception) {
                        log("解析消息失败: ${e.message}")
                        e.printStackTrace()
                    }
                }

                override fun onError(conn: WebSocket?, ex: Exception?) {
                    log("WebSocket错误: ${ex?.message}")
                    ex?.printStackTrace()
                }

                override fun onStart() {
                    log("服务器启动成功，端口: $port")
                }
            }

            log("启动服务器监听...")
            server?.start()
            log("服务器已启动")
        } catch (e: Exception) {
            log("启动服务器失败: ${e.message}")
            e.printStackTrace()
            throw e
        }
    }

    private fun handleRegister(conn: WebSocket, json: JSONObject) {
        val deviceId = json.optString("deviceId", "")
        if (deviceId.isNotEmpty()) {
            devices[deviceId] = conn
            log("设备注册: $deviceId")
            send(conn, JSONObject().apply {
                put("type", "registered")
                put("deviceId", deviceId)
            })
            deviceCountCallback?.invoke(devices.size)
        }
    }

    private fun handleConnectRequest(conn: WebSocket, json: JSONObject) {
        val fromDeviceId = json.optString("fromDeviceId", "")
        val toDeviceId = json.optString("toDeviceId", "")

        log("连接请求: $fromDeviceId -> $toDeviceId")

        val targetDevice = devices[toDeviceId]

        if (targetDevice != null) {
            val sessionId = generateSessionId()
            sessions[sessionId] = SessionInfo(fromDeviceId, toDeviceId, Date())

            send(targetDevice, JSONObject().apply {
                put("type", "incoming-connection")
                put("fromDeviceId", fromDeviceId)
                put("sessionId", sessionId)
            })

            log("发送incoming-connection到 $toDeviceId, 会话: $sessionId")
        } else {
            log("目标设备不在线: $toDeviceId")
            send(conn, JSONObject().apply {
                put("type", "connection-failed")
                put("reason", "device-offline")
                put("toDeviceId", toDeviceId)
            })
        }
    }

    private fun handleConnectionResponse(conn: WebSocket, json: JSONObject) {
        val sessionId = json.optString("sessionId", "")
        val accepted = json.optBoolean("accepted", false)

        log("连接响应: $sessionId -> ${if (accepted) "accepted" else "rejected"}")

        val session = sessions[sessionId]
        if (session != null) {
            session.status = if (accepted) "active" else "rejected"

            val fromDevice = devices[session.fromDeviceId]
            if (fromDevice != null) {
                send(fromDevice, JSONObject().apply {
                    put("type", "connection-result")
                    put("accepted", accepted)
                    put("sessionId", sessionId)
                    put("fromDeviceId", session.fromDeviceId)
                    put("toDeviceId", session.toDeviceId)
                })
            }
        }
    }

    private fun handleOffer(conn: WebSocket, json: JSONObject) {
        val sessionId = json.optString("sessionId", "")
        val offer = json.optJSONObject("offer")
        val toDeviceId = json.optString("toDeviceId", "")
        val fromDeviceId = findDeviceBySocket(conn)

        var resolvedSessionId = sessionId
        if (resolvedSessionId.isEmpty() && fromDeviceId != null) {
            for ((sid, session) in sessions) {
                if (session.fromDeviceId == fromDeviceId && session.status == "active") {
                    resolvedSessionId = sid
                    break
                }
            }
        }

        log("转发Offer: $resolvedSessionId $fromDeviceId -> $toDeviceId")

        if (toDeviceId.isNotEmpty()) {
            val targetDevice = devices[toDeviceId]
            if (targetDevice != null) {
                send(targetDevice, JSONObject().apply {
                    put("type", "offer")
                    put("sessionId", resolvedSessionId)
                    put("offer", offer)
                    put("fromDeviceId", fromDeviceId ?: "")
                })
            } else {
                log("转发Offer失败: 目标设备不在线 $toDeviceId")
            }
        }
    }

    private fun handleAnswer(conn: WebSocket, json: JSONObject) {
        val sessionId = json.optString("sessionId", "")
        val answer = json.optJSONObject("answer")
        val toDeviceId = json.optString("toDeviceId", "")
        val fromDeviceId = findDeviceBySocket(conn)

        log("转发Answer: $sessionId $fromDeviceId -> $toDeviceId")

        if (toDeviceId.isNotEmpty()) {
            val targetDevice = devices[toDeviceId]
            if (targetDevice != null) {
                send(targetDevice, JSONObject().apply {
                    put("type", "answer")
                    put("sessionId", sessionId)
                    put("answer", answer)
                    put("fromDeviceId", fromDeviceId ?: "")
                })
            }
        }
    }

    private fun handleIceCandidate(conn: WebSocket, json: JSONObject) {
        val sessionId = json.optString("sessionId", "")
        val candidate = json.optJSONObject("candidate")
        val toDeviceId = json.optString("toDeviceId", "")
        val fromDeviceId = findDeviceBySocket(conn)

        if (toDeviceId.isNotEmpty()) {
            val targetDevice = devices[toDeviceId]
            if (targetDevice != null) {
                send(targetDevice, JSONObject().apply {
                    put("type", "ice-candidate")
                    put("sessionId", sessionId)
                    put("candidate", candidate)
                    put("fromDeviceId", fromDeviceId ?: "")
                })
            }
        }
    }

    private fun send(conn: WebSocket, json: JSONObject) {
        if (conn.isOpen) {
            conn.send(json.toString())
        }
    }

    private fun findDeviceBySocket(conn: WebSocket): String? {
        for ((deviceId, socket) in devices) {
            if (socket == conn) {
                return deviceId
            }
        }
        return null
    }

    private fun generateSessionId(): String {
        val chars = "abcdefghijklmnopqrstuvwxyz0123456789"
        return (1..9)
            .map { chars[(Math.random() * chars.length).toInt()] }
            .joinToString("")
            .uppercase()
    }

    fun stop() {
        log("停止服务器...")
        scheduler.shutdown()
        try {
            server?.stop()
        } catch (e: Exception) {
            log("停止服务器错误: ${e.message}")
        }
        devices.clear()
        sessions.clear()
        log("服务器已停止")
    }

    fun getOnlineDeviceCount(): Int = devices.size

    private data class SessionInfo(
        val fromDeviceId: String,
        val toDeviceId: String,
        val createdAt: Date,
        var status: String = "pending"
    )
}
