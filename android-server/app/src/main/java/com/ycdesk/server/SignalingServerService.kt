package com.ycdesk.server

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.net.NetworkInterface
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class SignalingServerService : Service() {

    companion object {
        private const val CHANNEL_ID = "YCDeskServerChannel"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_START = "com.ycdesk.server.START"
        private const val ACTION_STOP = "com.ycdesk.server.STOP"

        fun startServer(context: Context, port: Int, useHttps: Boolean) {
            val intent = Intent(context, SignalingServerService::class.java).apply {
                action = ACTION_START
                putExtra("port", port)
                putExtra("useHttps", useHttps)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopServer(context: Context) {
            val intent = Intent(context, SignalingServerService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private val binder = LocalBinder()
    private lateinit var executorService: ExecutorService
    private var server: SignalingServer? = null
    private var isRunning = false
    private var currentPort = 3000

    inner class LocalBinder : Binder() {
        fun getService(): SignalingServerService = this@SignalingServerService
    }

    override fun onCreate() {
        super.onCreate()
        executorService = Executors.newSingleThreadExecutor()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannel()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.action?.let { action ->
            when (action) {
                ACTION_START -> {
                    val port = intent.getIntExtra("port", 3000)
                    val useHttps = intent.getBooleanExtra("useHttps", false)
                    startServerInternal(port, useHttps)
                }
                ACTION_STOP -> {
                    stopServerInternal()
                }
            }
        }
        return START_STICKY
    }

    private fun startServerInternal(port: Int, useHttps: Boolean) {
        if (isRunning) return

        currentPort = port
        sendLog("正在初始化服务器...")
        sendLog("端口: $port")
        sendLog("协议: Socket.IO v4 (WebSocket)")

        executorService.execute {
            try {
                sendLog("获取本地IP地址...")
                val localIP = getLocalIPAddress()
                sendLog("本地IP: $localIP")

                sendLog("创建信令服务器实例...")
                server = SignalingServer(port, useHttps)

                server?.logCallback = { message ->
                    sendLog(message)
                }

                server?.deviceCountCallback = { count ->
                    updateDeviceCount(count)
                }

                sendLog("正在启动服务器监听...")
                server?.start()
                isRunning = true

                val address = "$localIP:$port"

                sendLog("服务器启动成功!")
                sendLog("监听地址: $address")
                sendLog("等待客户端连接...")

                updateMainActivity(address, 0)

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForeground(NOTIFICATION_ID, createNotification())
                }
            } catch (e: Exception) {
                sendLog("服务器启动失败!")
                sendLog("错误类型: ${e.javaClass.simpleName}")
                sendLog("错误信息: ${e.message}")
                e.printStackTrace()
            }
        }
    }

    private fun stopServerInternal() {
        if (!isRunning) return

        sendLog("正在停止服务器...")

        executorService.execute {
            try {
                server?.stop()
                isRunning = false
                sendLog("服务器已停止")

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    stopForeground(true)
                }
                stopSelf()
            } catch (e: Exception) {
                sendLog("停止服务器失败: ${e.message}")
                e.printStackTrace()
            }
        }
    }

    private fun getLocalIPAddress(): String {
        try {
            val en = NetworkInterface.getNetworkInterfaces()
            while (en.hasMoreElements()) {
                val intf = en.nextElement()
                val enumIpAddr = intf.inetAddresses
                while (enumIpAddr.hasMoreElements()) {
                    val inetAddress = enumIpAddr.nextElement()
                    if (!inetAddress.isLoopbackAddress && inetAddress.hostAddress?.indexOf(':') == -1) {
                        return inetAddress.hostAddress ?: "127.0.0.1"
                    }
                }
            }
        } catch (e: Exception) {
            sendLog("获取IP地址失败: ${e.message}")
            e.printStackTrace()
        }
        return "127.0.0.1"
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "YCDesk Server",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText("监听端口: $currentPort")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun sendLog(message: String) {
        val intent = Intent(MainActivity.ACTION_SERVER_LOG).apply {
            putExtra(MainActivity.EXTRA_LOG_MESSAGE, message)
        }
        sendBroadcast(intent)
    }

    private fun updateMainActivity(address: String, deviceCount: Int) {
        val intent = Intent(MainActivity.ACTION_SERVER_STATUS).apply {
            putExtra(MainActivity.EXTRA_SERVER_ADDRESS, address)
            putExtra(MainActivity.EXTRA_DEVICE_COUNT, deviceCount)
            putExtra(MainActivity.EXTRA_IS_RUNNING, true)
        }
        sendBroadcast(intent)
    }

    private fun updateDeviceCount(count: Int) {
        val intent = Intent(MainActivity.ACTION_DEVICE_COUNT).apply {
            putExtra(MainActivity.EXTRA_DEVICE_COUNT, count)
        }
        sendBroadcast(intent)
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onDestroy() {
        super.onDestroy()
        stopServerInternal()
        if (::executorService.isInitialized) {
            executorService.shutdown()
        }
    }
}
