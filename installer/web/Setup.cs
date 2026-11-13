// Веб-установщик Kadro: своё тёмное окно с маскотом, «О тебе» с иконками, скачивание свежего Kadro-Setup с GitHub
// (сверка SHA-256 по SHA256SUMS.txt того же релиза), тихая установка и запуск Kadro.
// .NET Framework 4 (есть в каждой Windows 10/11), собирается mono-mcs: node scripts/pack-web-setup.mjs.
// Всё окно рисуется само (GDI+): кнопки, чипы и значки — без стандартных серых элементов Windows.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Kadro.WebSetup
{
    enum Page { Hello, About, Load, Error, Done }
    enum Phase { Connect, Download, Verify, Install }

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            try { SetProcessDPIAware(); } catch { }
#if TESTHOOKS
            // --shot <страница> <файл.png> [ru|en] [масштаб] — нарисовать страницу в картинку (для тестов и README)
            if (args.Length >= 3 && args[0] == "--shot") return Shot.Run(args);
#endif
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
            return 0;
        }

        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    }

    static class C
    {
        public static readonly Color Bg = Color.FromArgb(8, 7, 10);          // фон листа маскота — фигура сливается с окном
        public static readonly Color Surf = Color.FromArgb(22, 19, 27);
        public static readonly Color SurfHi = Color.FromArgb(32, 27, 38);
        public static readonly Color Line = Color.FromArgb(44, 38, 52);
        public static readonly Color Text = Color.FromArgb(236, 232, 242);
        public static readonly Color Muted = Color.FromArgb(154, 147, 168);
        public static readonly Color Accent = Color.FromArgb(255, 61, 127);
        public static readonly Color AccentHi = Color.FromArgb(255, 94, 148);
        public static readonly Color AccentLo = Color.FromArgb(230, 46, 108);
        public static readonly Color AccentInk = Color.FromArgb(42, 6, 20);
        public static readonly Color CloseHi = Color.FromArgb(196, 43, 28);
        public static Color A(Color c, int a) { return Color.FromArgb(a, c); }
    }

    static class S
    {
        public static int L; // 0 — русский, 1 — английский
        static readonly Dictionary<string, string[]> T = new Dictionary<string, string[]>
        {
            { "tagline", new[] { "Бесплатный видеоредактор: без водяного знака и подписки, ИИ работает прямо на твоём компьютере.", "A free video editor: no watermark, no subscription, and the AI runs right on your computer." } },
            { "langKadro", new[] { "Язык Kadro", "Kadro language" } },
            { "lang", new[] { "Язык", "Language" } },
            { "fact1", new[] { "Скачается около 350 МБ с GitHub", "About 350 MB downloads from GitHub" } },
            { "fact2", new[] { "Права администратора не нужны", "No administrator rights needed" } },
            { "fact3", new[] { "Если Kadro уже стоит — обновится, проекты останутся", "If Kadro is installed, it updates and keeps your projects" } },
            { "next", new[] { "Дальше", "Next" } },
            { "install", new[] { "Установить", "Install" } },
            { "aboutTitle", new[] { "Немного о тебе", "A bit about you" } },
            { "aboutSub", new[] { "Kadro подстроится под тебя. Можно пропустить.", "Kadro adapts to you. Feel free to skip." } },
            { "level", new[] { "Ты монтируешь", "Your editing experience" } },
            { "edit", new[] { "Что будешь монтировать", "What you'll edit" } },
            { "source", new[] { "Откуда узнал о Kadro", "Where you heard about Kadro" } },
            { "aboutNote", new[] { "Ответы остаются на этом компьютере", "Your answers stay on this computer" } },
            { "skip", new[] { "Пропустить", "Skip" } },
            { "loadTitle", new[] { "Скачиваю Kadro", "Downloading Kadro" } },
            { "loadSub", new[] { "Когда всё будет готово, Kadro откроется сам.", "Kadro opens by itself when it's ready." } },
            { "connect", new[] { "Подключаюсь к GitHub…", "Connecting to GitHub…" } },
            { "of", new[] { "из", "of" } },
            { "mb", new[] { "МБ", "MB" } },
            { "mbps", new[] { "МБ/с", "MB/s" } },
            { "verify", new[] { "Проверяю файл…", "Checking the file…" } },
            { "installTitle", new[] { "Устанавливаю Kadro", "Installing Kadro" } },
            { "installSub", new[] { "Меньше минуты — и Kadro откроется сам.", "Under a minute, then Kadro opens by itself." } },
            { "installing", new[] { "Раскладываю файлы…", "Putting files in place…" } },
            { "tipLabel", new[] { "Пока ждёшь", "While you wait" } },
            { "cancel", new[] { "Отмена", "Cancel" } },
            { "errTitle", new[] { "Не получилось", "That didn't work" } },
            { "errText", new[] { "Проверь интернет и попробуй ещё раз. Или скачай полный установщик со страницы Kadro на GitHub.", "Check your internet connection and try again. Or get the full installer from the Kadro page on GitHub." } },
            { "errSum", new[] { "Файл скачался с ошибкой: не совпала контрольная сумма.", "The download was damaged: the checksum didn't match." } },
            { "errNoSetup", new[] { "В последнем релизе нет установщика.", "The latest release has no installer." } },
            { "errExit", new[] { "Установщик Kadro остановился с кодом {0}.", "Kadro Setup stopped with code {0}." } },
            { "retry", new[] { "Повторить", "Try again" } },
            { "openPage", new[] { "Страница загрузки", "Download page" } },
            { "doneTitle", new[] { "Готово!", "All set!" } },
            { "doneText", new[] { "Kadro уже открывается. Удачного монтажа!", "Kadro is opening. Happy editing!" } },
            { "doneNoExe", new[] { "Kadro установлен: ярлык — на рабочем столе и в меню «Пуск».", "Kadro is installed: the shortcut is on the desktop and in the Start menu." } },
            { "close", new[] { "Закрыть", "Close" } },
            { "minimize", new[] { "Свернуть", "Minimize" } },
        };
        public static string Get(string k) { return T[k][L]; }

        // советы на время установки — то, что в Kadro правда есть
        public static readonly string[][] Tips =
        {
            new[] { "Скажи Kadro словами: «убери паузы и добавь субтитры» — он сделает это сам.", "Tell Kadro in words: “remove pauses and add captions” — it does the rest." },
            new[] { "Авто-ролик собирает видео под музыку из твоих клипов за пару минут.", "Auto Video cuts your clips to the beat of the music in a couple of minutes." },
            new[] { "ИИ работает прямо на компьютере: видео никуда не отправляются.", "The AI runs on your computer: your videos never leave it." },
            new[] { "Новичкам — простой режим: только нужные кнопки. Режим Pro — одним щелчком.", "Beginners get Simple mode with just the essentials. Pro mode is one click away." },
            new[] { "Ошибся? Ctrl+Z, а «История» вернёт любую версию проекта.", "Made a mistake? Ctrl+Z, and History brings back any version of the project." },
            new[] { "«Скрой лица» — и Kadro сам найдёт и размоет лица в кадре.", "Say “hide faces” and Kadro finds and blurs them for you." },
        };
    }

    sealed class Opt
    {
        public string Id, Icon, Ru, En;
        public Opt(string id, string icon, string ru, string en) { Id = id; Icon = icon; Ru = ru; En = en; }
        public string Text { get { return S.L == 0 ? Ru : En; } }
    }

    static class Survey
    {
        // те же ответы, что понимает Kadro (src/shared/survey.ts)
        public static readonly Opt[] Levels =
        {
            new Opt("new", "sprout", "Впервые", "First time"),
            new Opt("some", "scissors", "Уже монтировал", "Edited before"),
            new Opt("pro", "clapperboard", "Профи", "Pro"),
        };
        public static readonly Opt[] Edits =
        {
            new Opt("shorts", "smartphone", "Шортсы и рилсы", "Shorts and Reels"),
            new Opt("youtube", "monitor-play", "Видео на YouTube", "YouTube videos"),
            new Opt("games", "gamepad-2", "Игры и стримы", "Games and streams"),
            new Opt("family", "plane", "Семья и поездки", "Family and travel"),
            new Opt("work", "briefcase", "Работа", "Work"),
            new Opt("study", "graduation-cap", "Учёба", "School"),
            new Opt("other", "ellipsis", "Другое", "Other"),
        };
        public static readonly Opt[] Sources =
        {
            new Opt("tiktok", "music-2", "TikTok", "TikTok"),
            new Opt("youtube", "circle-play", "YouTube", "YouTube"),
            new Opt("telegram", "send", "Telegram", "Telegram"),
            new Opt("vk", "message-circle", "ВКонтакте", "VK"),
            new Opt("friends", "users", "Друзья", "Friends"),
            new Opt("search", "search", "Поиск", "Search"),
            new Opt("github", "code-xml", "GitHub", "GitHub"),
            new Opt("other", "ellipsis", "Другое", "Other"),
        };
    }

    static class Assets
    {
        static readonly PrivateFontCollection Fonts = new PrivateFontCollection();
        static readonly Dictionary<string, FontFamily> Families = new Dictionary<string, FontFamily>();
        static readonly Dictionary<string, Font> FontCache = new Dictionary<string, Font>();
        static readonly Dictionary<string, Bitmap> Images = new Dictionary<string, Bitmap>();

        static byte[] Res(string name)
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            {
                if (s == null) return null;
                var ms = new MemoryStream();
                s.CopyTo(ms);
                return ms.ToArray();
            }
        }

        static Assets()
        {
            foreach (var f in new[] { "onest-400", "onest-600", "unbounded-700" })
            {
                try
                {
                    var data = Res("font." + f + ".ttf");
                    if (data == null) continue;
                    // mono (проверка на Linux) шрифты из коллекции рисует квадратиками — там они ставятся в систему
                    if (Type.GetType("Mono.Runtime") != null) continue;
                    // память шрифта живёт до конца программы — GDI+ читает её при каждом рисовании
                    var p = Marshal.AllocCoTaskMem(data.Length);
                    Marshal.Copy(data, 0, p, data.Length);
                    Fonts.AddMemoryFont(p, data.Length);
                }
                catch { }
            }
            // семейства названы «Onest 400», «Onest 600», «Unbounded 700» (scripts/make-installer-fonts.py)
            try
            {
                foreach (var fam in Fonts.Families) Families[fam.Name.ToLowerInvariant().Replace(' ', '-')] = fam;
            }
            catch { }
        }

        /// <summary>Шрифт: "onest-400", "onest-600" или "unbounded-700"; размер — в логических пикселях.</summary>
        public static Font Font(string face, float px)
        {
            var key = face + "/" + px;
            Font f;
            if (FontCache.TryGetValue(key, out f)) return f;
            FontFamily fam;
            if (Families.TryGetValue(face, out fam)) f = new Font(fam, px, FontStyle.Regular, GraphicsUnit.Pixel);
            else
            {
                var name = face == "onest-400" ? "Onest 400" : face == "onest-600" ? "Onest 600" : "Unbounded 700";
                f = new Font(name, px, FontStyle.Regular, GraphicsUnit.Pixel);
                if (f.Name != name) f = new Font("Segoe UI", px, face == "onest-400" ? FontStyle.Regular : FontStyle.Bold, GraphicsUnit.Pixel);
            }
            FontCache[key] = f;
            return f;
        }

        public static Bitmap Mascot(string pose)
        {
            Bitmap b;
            if (Images.TryGetValue(pose, out b)) return b;
            var data = Res("mascot." + pose + ".png");
            if (data != null)
                using (var ms = new MemoryStream(data))
                using (var img = Image.FromStream(ms))
                    b = new Bitmap(img);
            Images[pose] = b;
            return b;
        }
    }

    sealed class Hot
    {
        public string Id;
        public RectangleF R;
        public Action Click;
        public bool Focusable = true;
        public float Radius = 12;
    }

    /// <summary>Состояние и рисование окна (без самой формы — так страницы можно нарисовать и в картинку).</summary>
    sealed class Ui
    {
        public const float W = 780, H = 520;
        public Page Page = Page.Hello;
        public DateTime PageAt = DateTime.UtcNow;
        public bool Known;                 // Kadro здесь уже запускали — «О тебе» не спрашиваем
        public bool Motion = true;
        public string Level, Source;
        public readonly List<string> Edits = new List<string>();
        public bool AboutDone;

        public volatile Phase Phase;
        public long Total, Got;
        public double Speed;
        public string Error, ErrorDetail;
        public bool Launched;
        public int Tip;
        public DateTime TipAt = DateTime.UtcNow;

        public readonly List<Hot> Hots = new List<Hot>();
        public string HoverId, PressId, FocusId;
        public bool Keyboard;

        public Action Close = delegate { }, Minimize = delegate { }, StartInstall = delegate { }, Retry = delegate { };
        public bool CanClose { get { return !(Page == Page.Load && Phase == Phase.Install); } }

        public void Go(Page p)
        {
            Page = p;
            PageAt = DateTime.UtcNow;
            FocusId = null;
        }

        public string Primary
        {
            get
            {
                switch (Page)
                {
                    case Page.Hello: return "hello-next";
                    case Page.About: return "about-install";
                    case Page.Error: return "err-retry";
                    case Page.Done: return "done-close";
                    default: return null;
                }
            }
        }

        // ---------- рисование ----------
        Graphics g;

        public void Render(Graphics gr)
        {
            g = gr;
            Hots.Clear();
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.Clear(C.Bg);
            switch (Page)
            {
                case Page.Hello: Hello(); break;
                case Page.About: About(); break;
                case Page.Load: Load(); break;
                case Page.Error: Fail(); break;
                case Page.Done: Done(); break;
            }
            Chrome();
            if (Keyboard && FocusId != null)
                foreach (var h in Hots)
                    if (h.Id == FocusId)
                        using (var p = Round(Inflate(h.R, 3), h.Radius + 3))
                        using (var pen = new Pen(C.A(Color.White, 210), 2f))
                            g.DrawPath(pen, p);
        }

        static RectangleF Inflate(RectangleF r, float d) { r.Inflate(d, d); return r; }

        float Enter()
        {
            if (!Motion) return 1f;
            var t = (float)Math.Min(1.0, (DateTime.UtcNow - PageAt).TotalMilliseconds / 420.0);
            return 1f - (1f - t) * (1f - t) * (1f - t);
        }

        public bool Animating { get { return Motion && (DateTime.UtcNow - PageAt).TotalMilliseconds < 450; } }

        void Chrome()
        {
            Mark(20, 18, 22);
            HotIcon("win-min", "minimize", W - 90, 10, false, Minimize);
            if (CanClose) HotIcon("win-close", "x", W - 48, 10, true, Close);
        }

        void HotIcon(string id, string icon, float x, float y, bool close, Action a)
        {
            var r = new RectangleF(x, y, 38, 32);
            bool hover = HoverId == id;
            if (hover)
                using (var p = Round(r, 8))
                using (var b = new SolidBrush(close ? C.CloseHi : C.SurfHi))
                    g.FillPath(b, p);
            Icon(icon == "minimize" ? "minus" : icon, x + 11, y + 8, 16, hover ? C.Text : C.Muted, 2f);
            Hots.Add(new Hot { Id = id, R = r, Click = a, Focusable = false, Radius = 8 });
        }

        void Mark(float x, float y, float size)
        {
            // знак Kadro: чёрный экран с полосками-«плёнкой» и кнопкой воспроизведения (как голова маскота)
            var k = size / 64f;
            var st = g.Save();
            g.TranslateTransform(x, y);
            g.ScaleTransform(k, k);
            using (var p = Round(new RectangleF(2.75f, 2.75f, 58.5f, 58.5f), 13.5f))
            {
                g.FillPath(Brushes.Black, p);
                using (var pen = new Pen(C.A(Color.White, 64), 1.5f)) g.DrawPath(pen, p);
            }
            using (var p = Round(new RectangleF(12, 12, 40, 4.5f), 2.25f)) g.FillPath(Brushes.White, p);
            using (var p = Round(new RectangleF(12, 47.5f, 40, 4.5f), 2.25f)) g.FillPath(Brushes.White, p);
            g.FillPolygon(Brushes.White, new[] { new PointF(26, 23.5f), new PointF(26, 40.5f), new PointF(42, 32) });
            g.Restore(st);
        }

        void Glow(float cx, float cy, float rx, float ry, int alpha)
        {
            using (var path = new GraphicsPath())
            {
                path.AddEllipse(cx - rx, cy - ry, rx * 2, ry * 2);
                using (var b = new PathGradientBrush(path))
                {
                    b.CenterColor = C.A(C.Accent, alpha);
                    b.SurroundColors = new[] { C.A(C.Accent, 0) };
                    b.FocusScales = new PointF(0.15f, 0.15f);
                    g.FillPath(b, path);
                }
            }
        }

        void Mascot(string pose, float cx, float bottom, float height)
        {
            var img = Assets.Mascot(pose);
            if (img == null) return;
            var e = Enter();
            var w = img.Width * height / img.Height;
            var dest = new RectangleF(cx - w / 2 - (1 - e) * 18, bottom - height + (1 - e) * 10, w, height);
            if (e >= 1) { g.DrawImage(img, dest); return; }
            using (var ia = new ImageAttributes())
            {
                var cm = new ColorMatrix { Matrix33 = e };
                ia.SetColorMatrix(cm);
                var pts = new[] { dest.Location, new PointF(dest.Right, dest.Top), new PointF(dest.Left, dest.Bottom) };
                g.DrawImage(img, pts, new RectangleF(0, 0, img.Width, img.Height), GraphicsUnit.Pixel, ia);
            }
        }

        static readonly StringFormat Typo = MakeTypo();
        static StringFormat MakeTypo()
        {
            var f = (StringFormat)StringFormat.GenericTypographic.Clone();
            f.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces;
            f.Trimming = StringTrimming.Word;
            return f;
        }

        SizeF Measure(string s, Font f, float maxW = 4000) { return g.MeasureString(s, f, new SizeF(maxW, 4000), Typo); }

        void Text(string s, Font f, Color c, float x, float y)
        {
            using (var b = new SolidBrush(c)) g.DrawString(s, f, b, x, y, Typo);
        }

        /// <summary>Текст с переносом строк; возвращает высоту.</summary>
        float Para(string s, Font f, Color c, float x, float y, float w)
        {
            var sz = Measure(s, f, w);
            using (var b = new SolidBrush(c)) g.DrawString(s, f, b, new RectangleF(x, y, w, sz.Height + 4), Typo);
            return sz.Height;
        }

        public static GraphicsPath Round(RectangleF r, float rad)
        {
            var p = new GraphicsPath();
            rad = Math.Min(rad, Math.Min(r.Width, r.Height) / 2);
            if (rad <= 0) { p.AddRectangle(r); return p; }
            var d = rad * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public void Icon(string name, float x, float y, float size, Color c, float stroke)
        {
            float[][] figs;
            if (!Icons.Figures.TryGetValue(name, out figs)) return;
            var k = size / 24f;
            using (var pen = new Pen(c, stroke * k) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
            using (var path = new GraphicsPath())
            {
                foreach (var f in figs)
                {
                    var pts = new PointF[(f.Length - 1) / 2];
                    for (int i = 0; i < pts.Length; i++) pts[i] = new PointF(x + f[1 + i * 2] * k, y + f[2 + i * 2] * k);
                    path.StartFigure();
                    if (pts.Length > 1) path.AddLines(pts);
                    if (f[0] > 0) path.CloseFigure();
                }
                g.DrawPath(pen, path);
            }
        }

        /// <summary>Кнопка: kind 0 — главная (розовая), 1 — обычная, 2 — тихая (без фона).</summary>
        float Button(string id, string text, float x, float y, int kind, Action a, string icon = null, float minW = 0)
        {
            var f = Assets.Font("onest-600", 15);
            var tw = Measure(text, f).Width;
            var w = Math.Max(minW, tw + 44 + (icon != null ? 24 : 0));
            var r = new RectangleF(x, y, w, 46);
            bool hover = HoverId == id, press = PressId == id && hover;
            Color fill = Color.Empty, fg;
            if (kind == 0) { fill = press ? C.AccentLo : hover ? C.AccentHi : C.Accent; fg = C.AccentInk; }
            else if (kind == 1) { fill = hover ? C.SurfHi : C.Surf; fg = C.Text; }
            else { if (hover) fill = C.Surf; fg = hover ? C.Text : C.Muted; }
            using (var p = Round(r, 12))
            {
                if (!fill.IsEmpty) using (var b = new SolidBrush(fill)) g.FillPath(b, p);
                if (kind == 1) using (var pen = new Pen(C.Line, 1f)) g.DrawPath(pen, p);
            }
            var tx = x + (w - tw - (icon != null ? 24 : 0)) / 2;
            Text(text, f, fg, tx, y + 13);
            if (icon != null) Icon(icon, tx + tw + 8, y + 15, 16, fg, 2f);
            Hots.Add(new Hot { Id = id, R = r, Click = a });
            return w;
        }

        SizeF ChipSize(Opt o, bool withIcon)
        {
            var f = Assets.Font("onest-400", 14);
            return new SizeF(Measure(o.Text, f).Width + (withIcon ? 26 : 0) + 30, 36);
        }

        void Chip(string id, Opt o, bool on, RectangleF r, Action a, bool withIcon = true)
        {
            bool hover = HoverId == id;
            using (var p = Round(r, r.Height / 2))
            {
                using (var b = new SolidBrush(on ? C.A(C.Accent, 44) : hover ? C.SurfHi : C.Surf)) g.FillPath(b, p);
                using (var pen = new Pen(on ? C.Accent : hover ? C.A(C.Muted, 90) : C.Line, on ? 1.5f : 1f)) g.DrawPath(pen, p);
            }
            float x = r.X + 15;
            if (withIcon)
            {
                Icon(o.Icon, x, r.Y + 9, 18, on ? C.Accent : C.Muted, 2f);
                x += 26;
            }
            Text(o.Text, Assets.Font("onest-400", 14), on ? Color.White : C.Text, x, r.Y + 9);
            Hots.Add(new Hot { Id = id, R = r, Click = a, Radius = r.Height / 2 });
        }

        /// <summary>Чипы в строку с переносом; возвращает нижний край.</summary>
        float Chips(string group, Opt[] opts, Func<Opt, bool> on, Action<Opt> click, float x, float y, float w)
        {
            float cx = x, cy = y;
            foreach (var o in opts)
            {
                var sz = ChipSize(o, true);
                if (cx > x && cx + sz.Width > x + w) { cx = x; cy += sz.Height + 8; }
                var opt = o;
                Chip(group + "-" + o.Id, o, on(o), new RectangleF(cx, cy, sz.Width, sz.Height), () => click(opt));
                cx += sz.Width + 8;
            }
            return cy + 36;
        }

        // ---------- страницы ----------
        void Hello()
        {
            Glow(200, 480, 230, 120, 70);
            Mascot("stand", 200, 496, 410);
            float x = 384, w = 352;
            Text("Kadro", Assets.Font("unbounded-700", 44), C.Text, x - 2, 78);
            var ty = 146 + Para(S.Get("tagline"), Assets.Font("onest-400", 16), C.Muted, x, 146, w);
            float ly = Math.Max(236, ty + 22);
            Text(S.Get(Known ? "lang" : "langKadro"), Assets.Font("onest-600", 13), C.Muted, x, ly);
            var ru = new Opt("ru", null, "Русский", "Русский");
            var en = new Opt("en", null, "English", "English");
            var rs = ChipSize(ru, false);
            var es = ChipSize(en, false);
            Chip("lang-ru", ru, S.L == 0, new RectangleF(x, ly + 22, rs.Width + 10, 36), () => S.L = 0, false);
            Chip("lang-en", en, S.L == 1, new RectangleF(x + rs.Width + 18, ly + 22, es.Width + 10, 36), () => S.L = 1, false);
            float y = ly + 84;
            foreach (var k in new[] { "fact1", "fact2", "fact3" })
            {
                Icon("check", x, y + 1, 16, C.Accent, 2.4f);
                y += Para(S.Get(k), Assets.Font("onest-400", 14), C.A(C.Text, 220), x + 26, y, w - 26) + 9;
            }
            Button("hello-next", S.Get(Known ? "install" : "next"), x, 448, 0, () => { if (Known) StartInstall(); else Go(Page.About); }, null, 180);
        }

        void About()
        {
            Glow(668, 506, 170, 90, 60);
            Mascot("point", 664, 506, 372);
            float x = 44, w = 524;
            Text(S.Get("aboutTitle"), Assets.Font("unbounded-700", 26), C.Text, x - 1, 52);
            Text(S.Get("aboutSub"), Assets.Font("onest-400", 15), C.Muted, x, 92);
            var lbl = Assets.Font("onest-600", 13);
            float y = 130;
            Text(S.Get("level"), lbl, C.Muted, x, y);
            y = Chips("level", Survey.Levels, o => Level == o.Id, o => Level = Level == o.Id ? null : o.Id, x, y + 20, w) + 16;
            Text(S.Get("edit"), lbl, C.Muted, x, y);
            y = Chips("edit", Survey.Edits, o => Edits.Contains(o.Id), o => { if (!Edits.Remove(o.Id)) Edits.Add(o.Id); }, x, y + 20, w) + 16;
            Text(S.Get("source"), lbl, C.Muted, x, y);
            Chips("source", Survey.Sources, o => Source == o.Id, o => Source = Source == o.Id ? null : o.Id, x, y + 20, w);
            var bw = Button("about-install", S.Get("install"), x, 452, 0, () => { AboutDone = true; StartInstall(); }, null, 180);
            var sw = Button("about-skip", S.Get("skip"), x + bw + 10, 452, 2, () => { Level = Source = null; Edits.Clear(); AboutDone = true; StartInstall(); });
            Para(S.Get("aboutNote"), Assets.Font("onest-400", 12), C.A(C.Muted, 200), x + bw + sw + 26, 458, 548 - (x + bw + sw + 26));
        }

        string Mb(long b) { return (b / 1048576.0).ToString(b < 10 * 1048576 ? "0.0" : "0", S.L == 0 ? System.Globalization.CultureInfo.GetCultureInfo("ru-RU") : System.Globalization.CultureInfo.InvariantCulture); }

        void Load()
        {
            Glow(200, 488, 220, 110, 64);
            Mascot("laptop", 196, 500, 392);
            float x = 400, w = 336;
            bool inst = Phase == Phase.Install;
            Text(S.Get(inst ? "installTitle" : "loadTitle"), Assets.Font("unbounded-700", 26), C.Text, x - 1, 104);
            Para(S.Get(inst ? "installSub" : "loadSub"), Assets.Font("onest-400", 15), C.Muted, x, 146, w);
            // полоска
            var track = new RectangleF(x, 208, w, 8);
            using (var p = Round(track, 4)) using (var b = new SolidBrush(C.SurfHi)) g.FillPath(b, p);
            var t = (float)((DateTime.UtcNow.Ticks / 10000) % 1600) / 1600f;
            if (Phase == Phase.Download && Total > 0 || Phase == Phase.Verify)
            {
                var frac = Phase == Phase.Verify ? 1f : Math.Min(1f, (float)Got / Total);
                if (frac > 0.005f)
                {
                    var fill = new RectangleF(x, 208, Math.Max(8, w * frac), 8);
                    using (var p = Round(fill, 4))
                    using (var b = new LinearGradientBrush(new RectangleF(x - 1, 208, w + 2, 8), C.AccentLo, C.AccentHi, 0f))
                        g.FillPath(b, p);
                }
            }
            else
            {
                // ждём ответа или ставим — бегущий отрезок
                var seg = w * 0.28f;
                var sx = x - seg + (w + seg) * t;
                var r = RectangleF.Intersect(new RectangleF(sx, 208, seg, 8), track);
                if (r.Width > 1) using (var p = Round(r, 4)) using (var b = new SolidBrush(C.Accent)) g.FillPath(b, p);
            }
            var small = Assets.Font("onest-400", 13);
            string left, right = "";
            switch (Phase)
            {
                case Phase.Connect: left = S.Get("connect"); break;
                case Phase.Download:
                    left = Total > 0 ? Mb(Got) + " " + S.Get("of") + " " + Mb(Total) + " " + S.Get("mb") : Mb(Got) + " " + S.Get("mb");
                    if (Speed > 0) right = (Speed / 1048576.0).ToString("0.0", S.L == 0 ? System.Globalization.CultureInfo.GetCultureInfo("ru-RU") : System.Globalization.CultureInfo.InvariantCulture) + " " + S.Get("mbps");
                    break;
                case Phase.Verify: left = S.Get("verify"); break;
                default: left = S.Get("installing"); break;
            }
            Text(left, small, C.Text, x, 228);
            if (right != "") Text(right, small, C.Muted, x + w - Measure(right, small).Width, 228);
            // совет
            var card = new RectangleF(x, 278, w, 138);
            using (var p = Round(card, 16))
            {
                using (var b = new SolidBrush(C.Surf)) g.FillPath(b, p);
                using (var pen = new Pen(C.Line, 1f)) g.DrawPath(pen, p);
            }
            Icon("lightbulb", x + 20, 296, 16, C.Accent, 2f);
            Text(S.Get("tipLabel"), Assets.Font("onest-600", 13), C.Accent, x + 44, 296);
            Para(S.Tips[Tip][S.L], Assets.Font("onest-400", 15), C.Text, x + 20, 326, w - 40);
            for (int i = 0; i < S.Tips.Length; i++)
                using (var b = new SolidBrush(i == Tip ? C.Accent : C.Line))
                    g.FillEllipse(b, x + w - 20 - (S.Tips.Length - i) * 12 + 6, 396, 6, 6);
            if (!inst) Button("load-cancel", S.Get("cancel"), x, 448, 2, Close);
        }

        void Fail()
        {
            Glow(206, 488, 220, 110, 50);
            Mascot("shrug", 206, 500, 380);
            float x = 400, w = 336;
            Text(S.Get("errTitle"), Assets.Font("unbounded-700", 26), C.Text, x - 1, 112);
            float y = 158;
            if (Error != null) y += Para(Error, Assets.Font("onest-600", 15), C.Text, x, y, w) + 10;
            y += Para(S.Get("errText"), Assets.Font("onest-400", 15), C.Muted, x, y, w) + 14;
            if (!string.IsNullOrEmpty(ErrorDetail)) Para(ErrorDetail, Assets.Font("onest-400", 12), C.A(C.Muted, 170), x, y, w);
            var bw = Button("err-retry", S.Get("retry"), x, 448, 0, Retry, null, 150);
            Button("err-page", S.Get("openPage"), x + bw + 10, 448, 2, () => Open("https://github.com/" + Gen.Repo + "/releases/latest"), "external-link");
        }

        void Done()
        {
            Glow(226, 520, 240, 120, 70);
            Mascot("wave", 226, H, 350);
            float x = 430, w = 306;
            Text(S.Get("doneTitle"), Assets.Font("unbounded-700", 40), C.Text, x - 2, 168);
            Para(S.Get(Launched ? "doneText" : "doneNoExe"), Assets.Font("onest-400", 16), C.Muted, x, 232, w);
            Button("done-close", S.Get("close"), x, 448, 1, Close, null, 140);
        }

        public static void Open(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }

        public void Activate(string id)
        {
            foreach (var h in Hots)
                if (h.Id == id) { h.Click(); return; }
        }

        public Hot At(PointF p)
        {
            for (int i = Hots.Count - 1; i >= 0; i--)
                if (Hots[i].R.Contains(p)) return Hots[i];
            return null;
        }

        public void MoveFocus(bool back)
        {
            var list = Hots.FindAll(h => h.Focusable);
            if (list.Count == 0) return;
            int i = list.FindIndex(h => h.Id == FocusId);
            i = i < 0 ? (back ? list.Count - 1 : 0) : (i + (back ? -1 : 1) + list.Count) % list.Count;
            FocusId = list[i].Id;
            Keyboard = true;
        }
    }

    /// <summary>Скачивание, проверка, установка и запуск — в фоновом потоке; окно только читает поля.</summary>
    sealed class Installer
    {
        readonly Ui ui;
        public volatile bool Cancel;
        public volatile bool Finished, Failed;
        public Installer(Ui ui) { this.ui = ui; }

        static string Base
        {
            get
            {
#if TESTHOOKS
                var b = Environment.GetEnvironmentVariable("KADRO_SETUP_BASE");
                if (!string.IsNullOrEmpty(b)) return b.TrimEnd('/');
#endif
                return "https://github.com/" + Gen.Repo + "/releases/latest/download";
            }
        }

        static bool IsMono { get { return Type.GetType("Mono.Runtime") != null; } }

        HttpWebRequest Req(string url)
        {
            var r = (HttpWebRequest)WebRequest.Create(url);
            r.UserAgent = "Kadro-Web-Setup/" + Gen.Version;
            r.Timeout = 30000;
            r.ReadWriteTimeout = 60000;
            return r;
        }

        public void Start()
        {
            Cancel = false; Finished = false; Failed = false;
            ui.Phase = Phase.Connect; ui.Got = 0; ui.Total = 0; ui.Speed = 0; ui.Error = null; ui.ErrorDetail = null;
            var t = new Thread(Work) { IsBackground = true };
            t.Start();
        }

        void Work()
        {
            string file = null;
            try
            {
                try { ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072; } catch { }
                string sums;
                using (var res = Req(Base + "/SHA256SUMS.txt").GetResponse())
                using (var rd = new StreamReader(res.GetResponseStream()))
                    sums = rd.ReadToEnd();
                var m = Regex.Match(sums, @"^([0-9a-fA-F]{64})\s+\*?(Kadro-Setup-[0-9.]+\.exe)\s*$", RegexOptions.Multiline);
                if (!m.Success) throw new SetupException(S.Get("errNoSetup"));
                var hash = m.Groups[1].Value.ToLowerInvariant();
                var name = m.Groups[2].Value;
                var dir = Path.Combine(Path.GetTempPath(), "Kadro-Web-Setup");
                Directory.CreateDirectory(dir);
                file = Path.Combine(dir, name);
                using (var res = Req(Base + "/" + name).GetResponse())
                using (var input = res.GetResponseStream())
                using (var fs = File.Create(file))
                using (var sha = SHA256.Create())
                {
                    ui.Total = res.ContentLength;
                    ui.Phase = Phase.Download;
                    var buf = new byte[1 << 17];
                    var sw = Stopwatch.StartNew();
                    long lastGot = 0;
                    double lastT = 0;
                    int n;
                    while ((n = input.Read(buf, 0, buf.Length)) > 0)
                    {
                        if (Cancel) throw new OperationCanceledException();
                        fs.Write(buf, 0, n);
                        sha.TransformBlock(buf, 0, n, null, 0);
                        ui.Got += n;
                        var now = sw.Elapsed.TotalSeconds;
                        if (now - lastT >= 0.5)
                        {
                            var inst = (ui.Got - lastGot) / (now - lastT);
                            ui.Speed = ui.Speed <= 0 ? inst : ui.Speed * 0.7 + inst * 0.3;
                            lastGot = ui.Got;
                            lastT = now;
                        }
                    }
                    sha.TransformFinalBlock(buf, 0, 0);
                    ui.Phase = Phase.Verify;
                    var got = BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
                    if (got != hash) throw new SetupException(S.Get("errSum"));
                }
                if (Cancel) throw new OperationCanceledException();
                ui.Phase = Phase.Install;
                WriteSettings();
                // полный установщик — тихо (/S): своё окно не показывает, ход виден здесь
                using (var p = Process.Start(new ProcessStartInfo(file, "/S") { UseShellExecute = !IsMono }))
                {
                    p.WaitForExit();
                    if (p.ExitCode != 0) throw new SetupException(string.Format(S.Get("errExit"), p.ExitCode));
                }
                try { File.Delete(file); } catch { }
                ui.Launched = LaunchKadro();
                Finished = true;
            }
            catch (OperationCanceledException)
            {
                Gone(file);
            }
            catch (SetupException e)
            {
                Gone(file);
                ui.Error = e.Message;
                Failed = true;
            }
            catch (Exception e)
            {
                Gone(file);
                ui.ErrorDetail = e.Message;
                Failed = true;
            }
        }

        static void Gone(string file)
        {
            if (file == null) return;
            try { File.Delete(file); } catch { }
        }

        static string Home { get { return Environment.GetFolderPath(Environment.SpecialFolder.UserProfile); } }

        public static bool KadroKnown()
        {
            return File.Exists(Path.Combine(Path.Combine(Home, ".kadro"), "settings.json"));
        }

        static string Q(string s) { return "\"" + s + "\""; }

        /// <summary>Язык и ответы — для первого запуска Kadro (если Kadro тут ещё не запускали). Как installer-about.mjs.</summary>
        void WriteSettings()
        {
            var dir = Path.Combine(Home, ".kadro");
            var file = Path.Combine(dir, "settings.json");
            if (File.Exists(file)) return;
            Directory.CreateDirectory(dir);
            var sb = new StringBuilder();
            sb.Append("{\"lang\": ").Append(Q(S.L == 0 ? "ru" : "en")).Append(", \"welcome\": \"pending\"");
            if (ui.AboutDone)
            {
                var edits = new List<string>();
                foreach (var o in Survey.Edits) if (ui.Edits.Contains(o.Id)) edits.Add(Q(o.Id));
                sb.Append(", \"about\": {\"edit\": [").Append(string.Join(", ", edits.ToArray())).Append("]");
                if (ui.Level != null) sb.Append(", \"level\": ").Append(Q(ui.Level));
                if (ui.Source != null) sb.Append(", \"source\": ").Append(Q(ui.Source));
                sb.Append(", \"from\": \"installer\"}");
            }
            sb.Append("}");
            File.WriteAllText(file, sb.ToString(), new UTF8Encoding(false));
        }

        static bool LaunchKadro()
        {
            string dir = null;
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Kadro"))
                    if (k != null) dir = k.GetValue("InstallDir") as string;
            }
            catch { }
            if (string.IsNullOrEmpty(dir))
                dir = Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs"), "Kadro");
            var exe = Path.Combine(dir, "Kadro.exe");
            if (!File.Exists(exe)) return false;
#if TESTHOOKS
            if (Environment.GetEnvironmentVariable("KADRO_SETUP_NO_LAUNCH") == "1") return true;
#endif
            try
            {
                Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true, WorkingDirectory = dir });
                return true;
            }
            catch { return false; }
        }
    }

    sealed class SetupException : Exception
    {
        public SetupException(string m) : base(m) { }
    }

    sealed class SetupForm : Form
    {
        readonly Ui ui = new Ui();
        readonly Installer inst;
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 33 };
        float scale = 1f;
        bool dragging;
        Point dragFrom;
        DateTime doneAt;

        public SetupForm()
        {
            inst = new Installer(ui);
            var lang = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
            S.L = lang == "ru" || lang == "uk" || lang == "be" || lang == "kk" ? 0 : 1;
            ui.Known = Installer.KadroKnown();
            ui.Motion = AnimationsOn();
            ui.Close = () => Close();
            ui.Minimize = () => WindowState = FormWindowState.Minimized;
            ui.StartInstall = ui.Retry = () =>
            {
                ui.Go(Page.Load);
                ui.Tip = 0;
                ui.TipAt = DateTime.UtcNow;
                inst.Start();
            };

            Text = "Kadro";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = C.Bg;
            KeyPreview = true;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            using (var gr = CreateGraphics()) scale = Math.Max(1f, gr.DpiX / 96f);
            ClientSize = new Size((int)Math.Round(Ui.W * scale), (int)Math.Round(Ui.H * scale));
            timer.Tick += Tick;
            timer.Start();
        }

        static bool AnimationsOn()
        {
            try
            {
                bool on = true;
                // SPI_GETCLIENTAREAANIMATION: «Показывать анимацию в Windows» выключено — без движения
                if (SystemParametersInfo(0x1042, 0, ref on, 0)) return on;
            }
            catch { }
            return true;
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ClassStyle |= 0x00020000; // CS_DROPSHADOW
                cp.Style |= 0x00020000;      // WS_MINIMIZEBOX — сворачивание щелчком по значку на панели задач
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try
            {
                int round = 2; // Windows 11: скруглённые углы окна
                DwmSetWindowAttribute(Handle, 33, ref round, 4);
            }
            catch { }
        }

        void Tick(object sender, EventArgs e)
        {
            if (inst.Finished && ui.Page == Page.Load)
            {
                inst.Finished = false;
                ui.Go(Page.Done);
                doneAt = DateTime.UtcNow;
            }
            if (inst.Failed && ui.Page == Page.Load)
            {
                inst.Failed = false;
                ui.Go(Page.Error);
            }
            if (ui.Page == Page.Load && (DateTime.UtcNow - ui.TipAt).TotalSeconds > 7)
            {
                ui.Tip = (ui.Tip + 1) % S.Tips.Length;
                ui.TipAt = DateTime.UtcNow;
            }
            // Kadro открылся — окно установщика уходит само
            if (ui.Page == Page.Done && ui.Launched && (DateTime.UtcNow - doneAt).TotalSeconds > 4) Close();
            if (ui.Page == Page.Load || ui.Animating) Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.ScaleTransform(scale, scale);
            ui.Render(e.Graphics);
        }

        PointF Logical(Point p) { return new PointF(p.X / scale, p.Y / scale); }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            if (dragging)
            {
                Location = new Point(Location.X + e.X - dragFrom.X, Location.Y + e.Y - dragFrom.Y);
                return;
            }
            var h = ui.At(Logical(e.Location));
            var id = h != null ? h.Id : null;
            Cursor = h != null ? Cursors.Hand : Cursors.Default;
            if (id != ui.HoverId) { ui.HoverId = id; Invalidate(); }
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            if (ui.HoverId != null) { ui.HoverId = null; Invalidate(); }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button != MouseButtons.Left) return;
            var h = ui.At(Logical(e.Location));
            if (h != null) { ui.PressId = h.Id; ui.Keyboard = false; Invalidate(); return; }
            // перетаскивание окна за пустое место
            try
            {
                ReleaseCapture();
                SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); // WM_NCLBUTTONDOWN, HTCAPTION
            }
            catch
            {
                dragging = true;
                dragFrom = e.Location;
            }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            dragging = false;
            var h = ui.At(Logical(e.Location));
            var pressed = ui.PressId;
            ui.PressId = null;
            if (h != null && h.Id == pressed) h.Click();
            Invalidate();
        }

        protected override bool ProcessDialogKey(Keys key)
        {
            switch (key & Keys.KeyCode)
            {
                case Keys.Tab:
                    ui.MoveFocus((key & Keys.Shift) != 0);
                    Invalidate();
                    return true;
                case Keys.Enter:
                case Keys.Space:
                    var id = ui.Keyboard && ui.FocusId != null ? ui.FocusId : (key & Keys.KeyCode) == Keys.Enter ? ui.Primary : null;
                    if (id != null) { ui.Activate(id); Invalidate(); }
                    return true;
                case Keys.Escape:
                    if (ui.CanClose) Close();
                    return true;
            }
            return base.ProcessDialogKey(key);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!ui.CanClose && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; return; }
            inst.Cancel = true;
            base.OnFormClosing(e);
        }

        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] static extern bool SystemParametersInfo(int action, int param, ref bool value, int ini);
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int value, int size);
    }

#if TESTHOOKS
    static class Shot
    {
        public static int Run(string[] a)
        {
            var ui = new Ui();
            S.L = a.Length > 3 && a[3] == "en" ? 1 : 0;
            ui.Motion = false;
            var sc = a.Length > 4 ? float.Parse(a[4], System.Globalization.CultureInfo.InvariantCulture) : 1f;
            switch (a[1])
            {
                case "hello": break;
                case "hello-known": ui.Known = true; break;
                case "about": ui.Go(Page.About); ui.Level = "new"; ui.Edits.Add("shorts"); ui.Edits.Add("games"); ui.Source = "telegram"; ui.HoverId = "edit-youtube"; break;
                case "load": ui.Go(Page.Load); ui.Phase = Phase.Download; ui.Total = 369098752; ui.Got = 148897792; ui.Speed = 4.2 * 1048576; ui.Tip = 0; break;
                case "connect": ui.Go(Page.Load); ui.Phase = Phase.Connect; ui.Tip = 1; break;
                case "install": ui.Go(Page.Load); ui.Phase = Phase.Install; ui.Tip = 3; break;
                case "error": ui.Go(Page.Error); ui.ErrorDetail = "The remote name could not be resolved: 'github.com'"; break;
                case "done": ui.Go(Page.Done); ui.Launched = true; break;
                default: return 2;
            }
            ui.Motion = false;
            using (var bmp = new Bitmap((int)(Ui.W * sc), (int)(Ui.H * sc)))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.ScaleTransform(sc, sc);
                    ui.Render(g);
                }
                bmp.Save(a[2], ImageFormat.Png);
            }
            return 0;
        }
    }
#endif
}
