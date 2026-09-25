package com.yathoughts.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // 与 index.html 的 --page-grad-a 保持一致：窗口底色必须等于页面底色，
    // 否则 WebView 没铺到的角落（系统栏、切边刘海）会露出一条纯色带
    private static final int BG_LIGHT = 0xFFEAF2FB;
    private static final int BG_DARK = 0xFF14171F;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ⚠️ registerPlugin 必须在 super.onCreate 之前
        // 它会往 initialPlugins 列表加类；super.onCreate 里 Bridge 才会实例化列表
        registerPlugin(AppSettingsPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        makeEdgeToEdge();
    }

    // 手势退出 / 切后台：JS 层 visibilitychange 已覆盖，此处为额外保险
    // 直接 evalJs 触发 commitSaveLight，确保数据在进程被杀前落盘
    @Override
    public void onPause() {
        super.onPause();
        try {
            bridge.evalJs(
                "if(window._commitSaveLight)window._commitSaveLight()"
            );
        } catch (Exception e) { /* Bridge 已销毁则忽略 */ }
    }

    /**
     * 全屏铺满，不留顶部/底部空带。
     *
     * ⚠️ 必须用代码设置：BridgeActivity.onCreate 在 setContentView 之后会
     * setTheme(库自带的 AppTheme_NoActionBar)，把本模块 res/values/styles.xml
     * 里的 windowTranslucentStatus / cutout 模式等配置全部覆盖掉，写了也不生效。
     */
    private void makeEdgeToEdge() {
        Window window = getWindow();
        boolean night = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        // 内容延伸到系统栏之下，安全区由网页的 env(safe-area-inset-*) 处理
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.setBackgroundDrawable(new ColorDrawable(night ? BG_DARK : BG_LIGHT));

        // 状态栏/导航栏图标颜色跟随系统深浅色，避免出现白底白图标看不见
        // 注：这两个 setter 返回 void，不能链式调用
        WindowInsetsControllerCompat insets =
                WindowCompat.getInsetsController(window, window.getDecorView());
        insets.setAppearanceLightStatusBars(!night);
        insets.setAppearanceLightNavigationBars(!night);

        // 刘海/挖孔屏也伸进去，否则刘海区域是一条窗口底色带
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            WindowManager.LayoutParams attrs = window.getAttributes();
            attrs.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attrs);
        }
    }
}
