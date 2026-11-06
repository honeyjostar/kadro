# Видеокарта для DirectML: в ORT >= 1.17 — самая производительная (на ноутбуке — дискретная, а не встроенная),
# SHERPA_ONNX_DML_DEVICE=<номер> — конкретная по номеру. В sherpa-onnx 1.13.8 всегда берётся номер 0.
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = '''      int32_t device_id = 0;
      OrtStatus *status =
          OrtSessionOptionsAppendExecutionProvider_DML(sess_opts, device_id);'''
new = '''      int32_t device_id = 0;
      OrtStatus *status = nullptr;
      const char *dml_dev = std::getenv("SHERPA_ONNX_DML_DEVICE");
#if ORT_API_VERSION >= 17
      if (!dml_dev) {
        const OrtDmlApi *dml_api = nullptr;
        OrtStatus *s0 = Ort::GetApi().GetExecutionProviderApi(
            "DML", ORT_API_VERSION, reinterpret_cast<const void **>(&dml_api));
        if (s0) {
          Ort::GetApi().ReleaseStatus(s0);
          dml_api = nullptr;
        }
        if (dml_api) {
          OrtDmlDeviceOptions dml_opts;
          dml_opts.Preference = OrtDmlPerformancePreference::HighPerformance;
          dml_opts.Filter = OrtDmlDeviceFilter::Gpu;
          OrtStatus *s1 = dml_api->SessionOptionsAppendExecutionProvider_DML2(
              sess_opts, &dml_opts);
          if (!s1) {
            SHERPA_ONNX_LOGE("DirectML: high-performance GPU");
            break;
          }
          SHERPA_ONNX_LOGE("DirectML high-performance GPU: %s",
                           Ort::GetApi().GetErrorMessage(s1));
          Ort::GetApi().ReleaseStatus(s1);
        }
      }
#endif
      if (dml_dev) device_id = std::atoi(dml_dev);
      status =
          OrtSessionOptionsAppendExecutionProvider_DML(sess_opts, device_id);'''
assert old in s, 'session.cc: DirectML block not found'
s = s.replace(old, new)
s = s.replace('#include <algorithm>\n', '#include <algorithm>\n#include <cstdlib>\n#include <cwchar>\n', 1)

# onnxruntime.dll подгружает DirectML.dll отложенно и по имени: Windows нашла бы старую DirectML.dll из System32.
# Загружаем свою — из папки onnxruntime.dll — заранее, тогда по имени найдётся уже загруженная.
pre = '''
#if defined(_WIN32) && SHERPA_ONNX_ENABLE_DIRECTML == 1
static void PreloadDirectML() {
  static bool done = false;
  if (done) return;
  done = true;
  HMODULE ort = GetModuleHandleW(L"onnxruntime.dll");
  if (!ort) return;
  wchar_t path[MAX_PATH];
  DWORD n = GetModuleFileNameW(ort, path, MAX_PATH);
  if (n == 0 || n >= MAX_PATH) return;
  wchar_t *slash = wcsrchr(path, L'\\\\');
  if (!slash) return;
  size_t room = MAX_PATH - static_cast<size_t>(slash + 1 - path);
  if (wcscpy_s(slash + 1, room, L"DirectML.dll") != 0) return;
  if (!LoadLibraryExW(path, nullptr, LOAD_WITH_ALTERED_SEARCH_PATH)) {
    SHERPA_ONNX_LOGE("DirectML.dll next to onnxruntime.dll is not loaded: %lu",
                     static_cast<unsigned long>(GetLastError()));
  }
}
#endif
'''
anchor = 'namespace sherpa_onnx {\n'
assert anchor in s, 'no namespace'
s = s.replace(anchor, anchor + pre, 1)
old2 = '''      sess_opts.DisableMemPattern();
      sess_opts.SetExecutionMode(ORT_SEQUENTIAL);
      int32_t device_id = 0;'''
assert old2 in s, 'no DML preamble'
s = s.replace(old2, '''      PreloadDirectML();
''' + old2, 1)
open(p, 'w', encoding='utf-8').write(s)
print('patched', p)
