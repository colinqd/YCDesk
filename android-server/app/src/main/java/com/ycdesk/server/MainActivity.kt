package com.ycdesk.server

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.TextUtils
import android.text.method.ScrollingMovementMethod
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    companion object {
        private const val PERMISSION_REQUEST_CODE = 100
        const val ACTION_SERVER_LOG = "com.ycdesk.server.LOG"
        const val ACTION_SERVER_STATUS = "com.ycdesk.server.STATUS"
        const val ACTION_DEVICE_COUNT = "com.ycdesk.server.DEVICE_COUNT"
        const val EXTRA_LOG_MESSAGE = "log_message"
        const val EXTRA_SERVER_ADDRESS = "server_address"
        const val EXTRA_DEVICE_COUNT = "device_count"
        const val EXTRA_IS_RUNNING = "is_running"
    }

    private lateinit var tvStatus: TextView
    private lateinit var statusDot: View
    private lateinit var etPort: EditText
    private lateinit var btnStartServer: Button
    private lateinit var btnStopServer: Button
    private lateinit var tvServerAddress: TextView
    private lateinit var tvOnlineDevices: TextView
    private lateinit var tvLog: TextView
    private lateinit var scrollView: ScrollView
    private lateinit var cardHttp: LinearLayout
    private lateinit var cardHttps: LinearLayout

    private var isServerRunning = false
    private var selectedMode = "http"
    private val dateFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    private val logBuilder = StringBuilder()

    private val logReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_SERVER_LOG -> {
                    val message = intent.getStringExtra(EXTRA_LOG_MESSAGE) ?: return
                    appendLog(message)
                }
                ACTION_SERVER_STATUS -> {
                    val address = intent.getStringExtra(EXTRA_SERVER_ADDRESS) ?: ""
                    val deviceCount = intent.getIntExtra(EXTRA_DEVICE_COUNT, 0)
                    val running = intent.getBooleanExtra(EXTRA_IS_RUNNING, false)

                    runOnUiThread {
                        tvServerAddress.text = "服务器地址: $address"
                        tvOnlineDevices.text = "在线设备: $deviceCount"
                    }
                }
                ACTION_DEVICE_COUNT -> {
                    val count = intent.getIntExtra(EXTRA_DEVICE_COUNT, 0)
                    runOnUiThread {
                        tvOnlineDevices.text = "在线设备: $count"
                    }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val rootView = createLayout()
        setContentView(rootView)

        initViews()
        requestPermissions()
        requestIgnoreBatteryOptimizations()
        registerLogReceiver()

        appendLog("YCDesk 信令服务器已启动")
        appendLog("请点击\"启动服务器\"按钮开始")
    }

    private fun createLayout(): LinearLayout {
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        }

        val headerLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(40, 60, 40, 40)
            val gradient = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.parseColor("#667eea"), Color.parseColor("#764ba2"))
            )
            background = gradient
        }

        val titleText = TextView(this).apply {
            text = "YCDesk Server"
            setTextColor(Color.WHITE)
            textSize = 28f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }

        val subtitleText = TextView(this).apply {
            text = "信令服务器管理工具"
            setTextColor(Color.parseColor("#D0FFFFFF"))
            textSize = 14f
        }

        headerLayout.addView(titleText)
        headerLayout.addView(subtitleText)
        rootLayout.addView(headerLayout, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val contentLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 24, 32, 24)
        }

        val statusBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(24, 16, 24, 16)
            val bg = GradientDrawable()
            bg.setColor(Color.parseColor("#f8f9fa"))
            bg.cornerRadius = 16f
            background = bg
        }

        statusDot = View(this).apply {
            val dotBg = GradientDrawable()
            dotBg.setColor(Color.parseColor("#dc3545"))
            dotBg.cornerRadius = 12f
            background = dotBg
            layoutParams = LinearLayout.LayoutParams(24, 24).apply {
                marginEnd = 16
            }
        }

        tvStatus = TextView(this).apply {
            text = "未启动"
            setTextColor(Color.parseColor("#495057"))
            textSize = 16f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }

        statusBar.addView(statusDot)
        statusBar.addView(tvStatus)
        contentLayout.addView(statusBar, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 24
        })

        val sectionTitle = TextView(this).apply {
            text = "启动模式"
            setTextColor(Color.parseColor("#333333"))
            textSize = 16f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        contentLayout.addView(sectionTitle, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 16
        })

        val modeSelector = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 2f
        }

        cardHttp = createModeCard("HTTP / WS", "推荐\n无需证书，简单快速\n适合局域网和测试环境", true)
        cardHttps = createModeCard("HTTPS / WSS", "安全\n需要 SSL 证书\n适合公网和生产环境", false)

        modeSelector.addView(cardHttp, LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        ).apply {
            marginEnd = 8
        })
        modeSelector.addView(cardHttps, LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        ).apply {
            marginStart = 8
        })

        contentLayout.addView(modeSelector, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 24
        })

        val portLabel = TextView(this).apply {
            text = "端口"
            setTextColor(Color.parseColor("#495057"))
            textSize = 13f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        contentLayout.addView(portLabel, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 8
        })

        etPort = EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText("3000")
            textSize = 14f
            setPadding(20, 16, 20, 16)
            val bg = GradientDrawable()
            bg.setColor(Color.WHITE)
            bg.setStroke(4, Color.parseColor("#e9ecef"))
            bg.cornerRadius = 16f
            background = bg
        }
        contentLayout.addView(etPort, LinearLayout.LayoutParams(
            200, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 24
        })

        tvServerAddress = TextView(this).apply {
            text = ""
            setTextColor(Color.parseColor("#667eea"))
            textSize = 14f
        }
        contentLayout.addView(tvServerAddress, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 8
        })

        tvOnlineDevices = TextView(this).apply {
            text = ""
            setTextColor(Color.parseColor("#495057"))
            textSize = 14f
        }
        contentLayout.addView(tvOnlineDevices, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 24
        })

        val buttonLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        btnStartServer = Button(this).apply {
            text = "启动服务器"
            setTextColor(Color.WHITE)
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(40, 20, 40, 20)
            val bg = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.parseColor("#667eea"), Color.parseColor("#764ba2"))
            )
            bg.cornerRadius = 16f
            background = bg
            setOnClickListener { startServer() }
        }

        btnStopServer = Button(this).apply {
            text = "停止服务器"
            setTextColor(Color.WHITE)
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(40, 20, 40, 20)
            val bg = GradientDrawable()
            bg.setColor(Color.parseColor("#dc3545"))
            bg.cornerRadius = 16f
            background = bg
            isEnabled = false
            setOnClickListener { stopServer() }
        }

        buttonLayout.addView(btnStartServer, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            marginEnd = 16
        })
        buttonLayout.addView(btnStopServer, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        contentLayout.addView(buttonLayout, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 24
        })

        val logTitle = TextView(this).apply {
            text = "运行日志"
            setTextColor(Color.parseColor("#333333"))
            textSize = 16f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        contentLayout.addView(logTitle, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = 12
        })

        scrollView = ScrollView(this).apply {
            val bg = GradientDrawable()
            bg.setColor(Color.parseColor("#1e1e1e"))
            bg.cornerRadius = 16f
            background = bg
            setPadding(20, 20, 20, 20)
        }

        tvLog = TextView(this).apply {
            setTextColor(Color.parseColor("#98c379"))
            textSize = 12f
            setTypeface(android.graphics.Typeface.MONOSPACE)
            movementMethod = ScrollingMovementMethod()
        }

        scrollView.addView(tvLog)
        contentLayout.addView(scrollView, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))

        rootLayout.addView(contentLayout, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))

        return rootLayout
    }

    private fun createModeCard(title: String, description: String, isSelected: Boolean): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
            val bg = GradientDrawable()
            if (isSelected) {
                bg.setColor(Color.parseColor("#F0F0FF"))
                bg.setStroke(4, Color.parseColor("#667eea"))
            } else {
                bg.setColor(Color.parseColor("#f8f9fa"))
                bg.setStroke(4, Color.parseColor("#e9ecef"))
            }
            bg.cornerRadius = 20f
            background = bg
            isClickable = true
            isFocusable = true

            val titleText = TextView(context).apply {
                text = title
                setTextColor(Color.parseColor("#333333"))
                textSize = 18f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            }

            val descText = TextView(context).apply {
                text = description
                setTextColor(Color.parseColor("#666666"))
                textSize = 12f
                setLineSpacing(4f, 1f)
            }

            addView(titleText, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = 12
            })
            addView(descText, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ))

            setOnClickListener { selectMode(this == cardHttp) }
        }
    }

    private fun selectMode(isHttp: Boolean) {
        selectedMode = if (isHttp) "http" else "https"
        updateModeCards()
    }

    private fun updateModeCards() {
        val httpBg = cardHttp.background as GradientDrawable
        val httpsBg = cardHttps.background as GradientDrawable

        if (selectedMode == "http") {
            httpBg.setColor(Color.parseColor("#F0F0FF"))
            httpBg.setStroke(4, Color.parseColor("#667eea"))
            httpsBg.setColor(Color.parseColor("#f8f9fa"))
            httpsBg.setStroke(4, Color.parseColor("#e9ecef"))
        } else {
            httpsBg.setColor(Color.parseColor("#F0F0FF"))
            httpsBg.setStroke(4, Color.parseColor("#667eea"))
            httpBg.setColor(Color.parseColor("#f8f9fa"))
            httpBg.setStroke(4, Color.parseColor("#e9ecef"))
        }
    }

    private fun initViews() {
        // Views are already initialized in createLayout()
    }

    private fun registerLogReceiver() {
        val filter = IntentFilter().apply {
            addAction(ACTION_SERVER_LOG)
            addAction(ACTION_SERVER_STATUS)
            addAction(ACTION_DEVICE_COUNT)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(logReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(logReceiver, filter)
        }
    }

    private fun requestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.FOREGROUND_SERVICE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            permissions.add(Manifest.permission.FOREGROUND_SERVICE_DATA_SYNC)
        }

        val hasAllPermissions = permissions.all { permission ->
            ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
        }

        if (!hasAllPermissions) {
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), PERMISSION_REQUEST_CODE)
        }
    }

    private fun requestIgnoreBatteryOptimizations() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun startServer() {
        var portStr = etPort.text.toString()
        if (TextUtils.isEmpty(portStr)) {
            portStr = "3000"
        }

        val port = try {
            portStr.toInt()
        } catch (e: NumberFormatException) {
            3000
        }

        val useHttps = selectedMode == "https"

        appendLog("正在启动服务器...")
        appendLog("端口: $port, 模式: ${if (useHttps) "HTTPS/WSS" else "HTTP/WS"}")

        SignalingServerService.startServer(this, port, useHttps)

        isServerRunning = true
        updateUI()
    }

    private fun stopServer() {
        appendLog("正在停止服务器...")
        SignalingServerService.stopServer(this)

        isServerRunning = false
        updateUI()
        runOnUiThread {
            tvServerAddress.text = ""
            tvOnlineDevices.text = ""
        }
    }

    private fun updateUI() {
        if (isServerRunning) {
            tvStatus.text = "运行中"
            val dotBg = statusDot.background as GradientDrawable
            dotBg.setColor(Color.parseColor("#28a745"))

            btnStartServer.isEnabled = false
            btnStopServer.isEnabled = true
            btnStartServer.alpha = 0.5f
            btnStopServer.alpha = 1f

            etPort.isEnabled = false
            cardHttp.isClickable = false
            cardHttps.isClickable = false
        } else {
            tvStatus.text = "未启动"
            val dotBg = statusDot.background as GradientDrawable
            dotBg.setColor(Color.parseColor("#dc3545"))

            btnStartServer.isEnabled = true
            btnStopServer.isEnabled = false
            btnStartServer.alpha = 1f
            btnStopServer.alpha = 0.5f

            etPort.isEnabled = true
            cardHttp.isClickable = true
            cardHttps.isClickable = true
        }
    }

    private fun appendLog(message: String) {
        runOnUiThread {
            val timestamp = dateFormat.format(Date())
            logBuilder.append("[$timestamp] $message\n")
            tvLog.text = logBuilder.toString()

            val scrollHandler = android.os.Handler(mainLooper)
            scrollHandler.postDelayed({
                scrollView.fullScroll(ScrollView.FOCUS_DOWN)
            }, 100)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(logReceiver)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
