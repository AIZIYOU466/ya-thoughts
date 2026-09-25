package com.yathoughts.app;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 应用内更新：系统下载管理器下载 APK 到私有目录，下载完成后调起系统安装器。
 * 前端拿到 apkUrl 后调 download，轮询 getProgress，done 后调 openInstaller。
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String APK_FILE_NAME = "ya-thoughts-update.apk";

    private long downloadId = -1;

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        cancelDownload();
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", null);
        if (url == null || url.isEmpty()) {
            call.reject("缺少下载链接", "EMPTY_URL");
            return;
        }
        cancelDownload();
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("系统未提供下载服务", "NO_DOWNLOAD_MANAGER");
            return;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                    .setTitle("Ya thoughts 更新")
                    .setDescription("正在下载安装包…")
                    .setAllowedNetworkTypes(
                            DownloadManager.Request.NETWORK_WIFI | DownloadManager.Request.NETWORK_MOBILE)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    // 私有目录，不需要任何存储权限
                    .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, APK_FILE_NAME);
            downloadId = manager.enqueue(request);
            JSObject ret = new JSObject();
            ret.put("downloadId", downloadId);
            call.resolve(ret);
        } catch (Exception e) {
            downloadId = -1;
            // 具体异常交给 Capacitor 记入 logcat，这里给前端可读的提示
            call.reject("下载任务入队失败", "ENQUEUE_FAILED", e);
        }
    }

    @PluginMethod
    public void getProgress(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("percent", -1);
        ret.put("done", false);
        ret.put("failed", false);
        ret.put("fileExists", getApkFile().exists());
        if (downloadId < 0) {
            call.resolve(ret);
            return;
        }
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("系统未提供下载服务", "NO_DOWNLOAD_MANAGER");
            return;
        }
        try {
            DownloadManager.Query query = new DownloadManager.Query();
            query.setFilterById(downloadId);
            Cursor cursor = manager.query(query);
            if (cursor == null) {
                call.reject("查询下载任务失败", "QUERY_FAILED");
                return;
            }
            try {
                if (!cursor.moveToFirst()) {
                    // 任务记录已消失（被移除），当作未失败也不当已完成
                    downloadId = -1;
                    call.resolve(ret);
                    return;
                }
                int totalIdx = columnSafe(cursor, DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                int downloadedIdx = columnSafe(cursor, DownloadManager.COLUMN_BYTES_DOWNLOADED);
                int statusIdx = columnSafe(cursor, DownloadManager.COLUMN_STATUS);
                int status = (statusIdx >= 0) ? cursor.getInt(statusIdx) : DownloadManager.STATUS_FAILED;
                int total = (totalIdx >= 0) ? cursor.getInt(totalIdx) : 0;
                int downloaded = (downloadedIdx >= 0) ? cursor.getInt(downloadedIdx) : 0;

                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    ret.put("percent", 100);
                    ret.put("done", true);
                } else if (status == DownloadManager.STATUS_FAILED || status == DownloadManager.STATUS_CANCELED) {
                    ret.put("failed", true);
                } else if (total > 0) {
                    ret.put("percent", Math.min(100, downloaded * 100 / total));
                }
                call.resolve(ret);
            } finally {
                cursor.close();
            }
        } catch (Exception e) {
            call.reject("查询下载进度失败", "QUERY_FAILED", e);
        }
    }

    @PluginMethod
    public void openInstaller(PluginCall call) {
        File apk = getApkFile();
        if (!apk.exists() || apk.length() == 0) {
            call.reject("安装包还没下载完，先点「下载更新」", "APK_NOT_READY");
            return;
        }
        // Android 8+ 必须先有「允许安装未知应用」权限，系统会弹授权
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("需要「允许安装未知应用」权限", "INSTALL_PERMISSION_DENIED");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("系统没有可用的安装程序", "NO_INSTALLER");
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Uri pkg = Uri.parse("package:" + getContext().getPackageName());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                getContext().startActivity(
                        new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, pkg));
                call.resolve();
                return;
            } catch (ActivityNotFoundException ignored) {
            }
        }
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("无法打开系统设置", "NO_SETTINGS");
        }
    }

    /**
     * 取消在途下载并清掉半成品文件：下载器按固定文件名写入，
     * 残留的同名文件会让下一次入队直接失败。
     */
    private void cancelDownload() {
        if (downloadId < 0) return;
        try {
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            // remove 会同时停掉任务并删除半成品文件；cancel 只改状态，文件要额外清
            if (manager != null) manager.remove(new long[]{downloadId});
        } catch (Exception ignored) {
        }
        downloadId = -1;
        getApkFile().delete();
    }

    private File getApkFile() {
        return new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_FILE_NAME);
    }

    private int columnSafe(Cursor cursor, String column) {
        try {
            return cursor.getColumnIndex(column);
        } catch (IllegalArgumentException e) {
            return -1;
        }
    }
}
