/**
 * =================================================================
 * SCRIPT UTAMA FRONTEND - SISTEM PRESENSI QR (VERSI DIPERBAIKI DENGAN METODE FormData)
 * =================================================================
 * @version 2.3 - Solusi 1: Mengadopsi Sistem Kerja Aplikasi Jurnal
 * @author Gemini AI Expert for User
 *
 * PERUBAHAN UTAMA:
 * - [PERBAIKAN] Mengubah semua pengiriman data POST dari `JSON.stringify` menjadi `new FormData()`.
 *   Ini membuat semua permintaan menjadi "Simple Request" dan menghindari masalah CORS
 *   tanpa memerlukan `doOptions` di backend.
 * - [SINKRONISASI] Backend sekarang akan membaca data dari `e.parameter`, bukan `e.postData.contents`.
 */

// ====================================================================
// TAHAP 1: KONFIGURASI GLOBAL DAN STATE APLIKASI
// ====================================================================

// URL Google Apps Script yang telah di-deploy
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzG7R0mSAI6kg4QIcy3t3QjNEkzrrO8NktwczXraaOyCSALaHfB0gnmFSrrHGXy0ccEKw/exec";

// State Aplikasi Terpusat untuk menyimpan data cache
const AppState = {
    siswa: [],
    users: [],
    rekap: [],
};

// Variabel untuk instance QR Scanner
let qrScannerDatang, qrScannerPulang;
let isScanning = { datang: false, pulang: false };

// ====================================================================
// TAHAP 2: FUNGSI-FUNGSI PEMBANTU (HELPERS)
// ====================================================================

/**
 * Menampilkan atau menyembunyikan indikator loading.
 * @param {boolean} isLoading - True untuk menampilkan, false untuk menyembunyikan.
 */
function showLoading(isLoading) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = isLoading ? 'flex' : 'none';
    }
}

/**
 * Menampilkan pesan status di bagian atas halaman.
 * @param {string} message - Pesan yang akan ditampilkan.
 * @param {string} type - Tipe pesan ('success', 'error', 'info').
 * @param {number} duration - Durasi tampilan pesan dalam milidetik.
 */
function showStatusMessage(message, type = 'info', duration = 5000) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) {
        alert(message);
        return;
    }
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    window.scrollTo(0, 0);
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, duration);
}

/**
 * Memainkan suara sederhana untuk umpan balik UX.
 * @param {string} type - Tipe suara ('success' atau 'error').
 */
function playSound(type) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
        oscillator.type = (type === 'success') ? 'sine' : 'square';
        oscillator.frequency.setValueAtTime((type === 'success') ? 600 : 200, audioContext.currentTime);
        oscillator.start(audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        console.warn("Web Audio API tidak didukung atau gagal.", e);
    }
}

/**
 * Wrapper untuk semua pemanggilan API. Menangani loading, parsing, dan error.
 * @param {string} url - URL tujuan.
 * @param {object} options - Opsi untuk fetch (method, body, dll.).
 * @returns {Promise<object|null>} - Data hasil atau null jika gagal.
 */
async function makeApiCall(url, options = {}) {
    showLoading(true);
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        if (result.status === 'success') {
            return result;
        } else {
            throw new Error(result.message || 'Terjadi kesalahan pada server.');
        }
    } catch (error) {
        showStatusMessage(`Kesalahan: ${error.message}`, 'error');
        playSound('error');
        return null;
    } finally {
        showLoading(false);
    }
}

/**
 * Mengatur fungsionalitas untuk ikon "lihat password".
 */
function setupPasswordToggle() {
    const toggleIcon = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    if (!toggleIcon || !passwordInput) return;
    
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
    const eyeSlashIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" /></svg>`;
    
    toggleIcon.innerHTML = eyeIcon;
    toggleIcon.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        toggleIcon.innerHTML = isPassword ? eyeSlashIcon : eyeIcon;
    });
}


// ====================================================================
// TAHAP 3: FUNGSI-FUNGSI UTAMA
// ====================================================================

// --- 3.1. OTENTIKASI & SESI ---
function checkAuthentication() {
    const user = sessionStorage.getItem('loggedInUser');
    if (user) {
        const userData = JSON.parse(user);
        const welcomeEl = document.getElementById('welcomeMessage');
        if (welcomeEl) welcomeEl.textContent = `Selamat Datang, ${userData.nama}!`;
        if (userData.peran && userData.peran.toLowerCase() !== 'admin') {
            const btn = document.querySelector('button[data-section="penggunaSection"]');
            if (btn) btn.style.display = 'none';
        }
    } else if (window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'index.html';
    }
}

async function handleLogin() {
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    if (!usernameEl.value || !passwordEl.value) {
        return showStatusMessage("Username dan password harus diisi.", 'error');
    }
    
    const formData = new FormData();
    formData.append('action', 'login');
    formData.append('username', usernameEl.value);
    formData.append('password', passwordEl.value);

    const result = await makeApiCall(SCRIPT_URL, { 
        method: 'POST', 
        body: formData 
    });

    if (result) {
        sessionStorage.setItem('loggedInUser', JSON.stringify(result.data));
        window.location.href = 'dashboard.html';
    }
}

function handleLogout() {
    if (confirm('Apakah Anda yakin ingin logout?')) {
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
    }
}

// --- 3.2. LOGIKA PRESENSI QR ---
function startQrScanner(type) {
    if (isScanning[type]) return;
    const scannerId = type === 'datang' ? 'qrScannerDatang' : 'qrScannerPulang';
    const scanner = new Html5QrcodeScanner(scannerId, { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    
    const onScanSuccess = (decodedText) => {
        scanner.pause(true);
        processQrScan(decodedText, type);
        setTimeout(() => scanner.resume(), 3000);
    };

    scanner.render(onScanSuccess, () => {});
    if (type === 'datang') qrScannerDatang = scanner; else qrScannerPulang = scanner;
    isScanning[type] = true;
    document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang').textContent = "Arahkan kamera ke QR Code Siswa";
}

function stopQrScanner(type) {
    const scanner = type === 'datang' ? qrScannerDatang : qrScannerPulang;
    if (scanner && isScanning[type]) {
        try {
            scanner.clear().catch(err => console.error(`Gagal menghentikan scanner ${type}:`, err));
        } catch(e) {
            console.error('Error saat membersihkan scanner:', e);
        } finally {
            isScanning[type] = false;
        }
    }
}

async function processQrScan(qrData, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    
    const formData = new FormData();
    formData.append('action', 'recordAttendance');
    formData.append('qrData', qrData);
    formData.append('type', type);

    const result = await makeApiCall(SCRIPT_URL, { 
      method: 'POST',
      body: formData 
    });
    
    if (result) {
        playSound('success');
        resultEl.className = 'scan-result success';
        resultEl.innerHTML = `<strong>${result.message}</strong><br>${result.nama} (${qrData}) - ${result.waktu}`;
        const logTable = document.getElementById(type === 'datang' ? 'logTableBodyDatang' : 'logTableBodyPulang');
        logTable.insertRow(0).innerHTML = `<td>${result.waktu}</td><td>${qrData}</td><td>${result.nama}</td>`;
    } else {
        resultEl.className = 'scan-result error';
        resultEl.textContent = document.getElementById('statusMessage').textContent;
    }
}

// --- 3.3. REKAP PRESENSI ---
async function loadRekapPresensi() {
    const startDate = document.getElementById('rekapFilterTanggalMulai').value;
    const endDate = document.getElementById('rekapFilterTanggalSelesai').value;
    const exportButton = document.getElementById('exportRekapButton');
    if (!startDate || !endDate) return showStatusMessage('Harap pilih rentang tanggal.', 'error');
    
    exportButton.style.display = 'none';
    const params = new URLSearchParams({ action: 'getAttendanceReport', startDate, endDate }).toString();
    const result = await makeApiCall(`${SCRIPT_URL}?${params}`);
    
    if (result) {
        AppState.rekap = result.data;
        renderRekapTable(AppState.rekap);
        if (AppState.rekap.length > 0) exportButton.style.display = 'inline-block';
    } else {
        renderRekapTable([]);
    }
}

function renderRekapTable(data) {
    const tableBody = document.getElementById('rekapTableBody');
    tableBody.innerHTML = data.length === 0 
        ? '<tr><td colspan="6" style="text-align: center;">Tidak ada data rekap ditemukan.</td></tr>'
        : data.map(row => `<tr><td data-label="Tanggal">${row.Tanggal}</td><td data-label="NISN">${row.NISN}</td><td data-label="Nama">${row.Nama}</td><td data-label="Datang">${row.WaktuDatang}</td><td data-label="Pulang">${row.WaktuPulang}</td><td data-label="Status">${row.Status}</td></tr>`).join('');
}

function exportRekapToExcel() {
    if (AppState.rekap.length === 0) return showStatusMessage('Tidak ada data untuk diekspor.', 'info');
    const worksheet = XLSX.utils.json_to_sheet(AppState.rekap);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Presensi");
    XLSX.writeFile(workbook, `Rekap_Presensi_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// --- 3.4. MANAJEMEN SISWA & QR CODE ---
async function loadSiswa() {
    const result = await makeApiCall(`${SCRIPT_URL}?action=getSiswa`);
    if (result) {
        AppState.siswa = result.data;
        renderSiswaTable(AppState.siswa);
    }
}

function renderSiswaTable(siswaArray) {
    const tableBody = document.getElementById('siswaResultsTableBody');
    tableBody.innerHTML = siswaArray.length === 0
        ? '<tr><td colspan="4" style="text-align: center;">Data siswa tidak ditemukan.</td></tr>'
        : siswaArray.map(siswa => `
            <tr>
                <td data-label="NISN">${siswa.NISN}</td>
                <td data-label="Nama">${siswa.Nama}</td>
                <td data-label="Kelas">${siswa.Kelas}</td>
                <td data-label="Aksi">
                    <button class="btn btn-sm btn-primary" onclick="generateQRHandler('${siswa.NISN}')">QR Code</button>
                    <button class="btn btn-sm btn-secondary" onclick="editSiswaHandler('${siswa.NISN}')">Ubah</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSiswaHandler('${siswa.NISN}')">Hapus</button>
                </td>
            </tr>`).join('');
}

async function saveSiswa() {
    const form = document.getElementById('formSiswa');
    const formData = new FormData(form);
    const oldNisn = document.getElementById('formNisnOld').value;

    formData.append('action', oldNisn ? 'updateSiswa' : 'addSiswa');
    if (oldNisn) {
        formData.append('oldNisn', oldNisn);
    }
    
    const result = await makeApiCall(SCRIPT_URL, { 
      method: 'POST',
      body: formData 
    });

    if (result) {
        showStatusMessage(result.message, 'success');
        resetFormSiswa();
        loadSiswa();
    }
}

function editSiswaHandler(nisn) {
    const siswa = AppState.siswa.find(s => s.NISN == nisn);
    if (!siswa) return;
    document.getElementById('formNisn').value = siswa.NISN;
    document.getElementById('formNama').value = siswa.Nama;
    document.getElementById('formKelas').value = siswa.Kelas;
    document.getElementById('formNisnOld').value = siswa.NISN;
    document.getElementById('saveSiswaButton').textContent = 'Update Data Siswa';
    document.getElementById('formSiswa').scrollIntoView({ behavior: 'smooth' });
}

function resetFormSiswa() {
    document.getElementById('formSiswa').reset();
    document.getElementById('formNisnOld').value = '';
    document.getElementById('saveSiswaButton').textContent = 'Simpan Data Siswa';
}

async function deleteSiswaHandler(nisn) {
    if (confirm(`Yakin ingin menghapus siswa dengan NISN: ${nisn}?`)) {
        const formData = new FormData();
        formData.append('action', 'deleteSiswa');
        formData.append('nisn', nisn);

        const result = await makeApiCall(SCRIPT_URL, { 
          method: 'POST',
          body: formData 
        });
        if (result) {
            showStatusMessage(result.message, 'success');
            loadSiswa();
        }
    }
}

function generateQRHandler(nisn) {
    const siswa = AppState.siswa.find(s => s.NISN == nisn);
    if (!siswa) return;
    document.getElementById('qrModalStudentName').textContent = `QR Code: ${siswa.Nama}`;
    document.getElementById('qrModalStudentNisn').textContent = `NISN: ${siswa.NISN}`;
    const canvas = document.getElementById('qrCodeCanvas');
    canvas.innerHTML = '';
    new QRCode(canvas, { text: siswa.NISN.toString(), width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
    document.getElementById('qrModal').style.display = 'flex';
}

function printQrCode() {
    const modalContent = document.querySelector("#qrModal .modal-content").cloneNode(true);
    modalContent.querySelector('.modal-close-button')?.remove();
    modalContent.querySelector('#printQrButton')?.remove();
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(`<html><head><title>Cetak QR</title><style>body{font-family:sans-serif;text-align:center}#qrCodeCanvas img{display:block;margin:20px auto}</style></head><body>${modalContent.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}

// --- 3.5. MANAJEMEN PENGGUNA ---
async function loadUsers() {
    const result = await makeApiCall(`${SCRIPT_URL}?action=getUsers`);
    if (result) AppState.users = result.data;
    renderUsersTable(AppState.users);
}

function renderUsersTable(usersArray) {
    const tableBody = document.getElementById('penggunaResultsTableBody');
    tableBody.innerHTML = usersArray.length === 0
        ? '<tr><td colspan="4" style="text-align: center;">Belum ada pengguna.</td></tr>'
        : usersArray.map(user => `
            <tr>
                <td data-label="Nama">${user.nama}</td>
                <td data-label="Username">${user.username}</td>
                <td data-label="Peran">${user.peran}</td>
                <td data-label="Aksi">
                    <button class="btn btn-sm btn-secondary" onclick="editUserHandler('${user.username}')">Ubah</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUserHandler('${user.username}')">Hapus</button>
                </td>
            </tr>`).join('');
}

async function saveUser() {
    const form = document.getElementById('formPengguna');
    const formData = new FormData(form);
    const oldUsername = document.getElementById('formUsernameOld').value;
    const password = document.getElementById('formPassword').value;

    if (!oldUsername && !password) return showStatusMessage('Password wajib diisi untuk pengguna baru.', 'error');
    
    formData.append('action', oldUsername ? 'updateUser' : 'addUser');
    if (oldUsername) {
        formData.append('oldUsername', oldUsername);
    }

    const result = await makeApiCall(SCRIPT_URL, { 
      method: 'POST',
      body: formData 
    });

    if (result) {
        showStatusMessage(result.message, 'success');
        resetFormPengguna();
        loadUsers();
    }
}

function editUserHandler(username) {
    const user = AppState.users.find(u => u.username === username);
    if (!user) return;
    document.getElementById('formUsernameOld').value = user.username;
    document.getElementById('formNamaPengguna').value = user.nama;
    document.getElementById('formUsername').value = user.username;
    document.getElementById('formPeran').value = user.peran;
    document.getElementById('formPassword').value = '';
    document.getElementById('savePenggunaButton').textContent = 'Update Pengguna';
    document.getElementById('formPengguna').scrollIntoView({ behavior: 'smooth' });
}

async function deleteUserHandler(username) {
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    if (loggedInUser?.username === username) return showStatusMessage('Anda tidak dapat menghapus akun Anda sendiri.', 'error');
    
    if (confirm(`Yakin ingin menghapus pengguna '${username}'?`)) {
        const formData = new FormData();
        formData.append('action', 'deleteUser');
        formData.append('username', username);

        const result = await makeApiCall(SCRIPT_URL, { 
          method: 'POST',
          body: formData
        });
        if (result) {
            showStatusMessage(result.message, 'success');
            loadUsers();
        }
    }
}

function resetFormPengguna() {
    document.getElementById('formPengguna').reset();
    document.getElementById('formUsernameOld').value = '';
    document.getElementById('savePenggunaButton').textContent = 'Simpan Pengguna';
}

// ====================================================================
// TAHAP 4: INISIALISASI DAN EVENT LISTENERS
// ====================================================================

function setupDashboardListeners() {
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    document.querySelectorAll('.section-nav button').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.section-nav button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            stopQrScanner('datang');
            stopQrScanner('pulang');

            const sectionId = button.dataset.section;
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = section.id === sectionId ? 'block' : 'none';
            });
            
            const actions = {
                datangSection: () => startQrScanner('datang'),
                pulangSection: () => startQrScanner('pulang'),
                rekapSection: () => {
                    const today = new Date().toISOString().slice(0, 10);
                    document.getElementById('rekapFilterTanggalMulai').value = today;
                    document.getElementById('rekapFilterTanggalSelesai').value = today;
                    loadRekapPresensi();
                },
                siswaSection: loadSiswa,
                penggunaSection: loadUsers,
            };
            actions[sectionId]?.();
        });
    });

    document.getElementById('filterRekapButton')?.addEventListener('click', loadRekapPresensi);
    document.getElementById('exportRekapButton')?.addEventListener('click', exportRekapToExcel);
    document.getElementById('formSiswa')?.addEventListener('submit', (e) => { e.preventDefault(); saveSiswa(); });
    document.getElementById('resetSiswaButton')?.addEventListener('click', resetFormSiswa);
    document.getElementById('formPengguna')?.addEventListener('submit', (e) => { e.preventDefault(); saveUser(); });
    document.getElementById('resetPenggunaButton')?.addEventListener('click', resetFormPengguna);
    document.querySelector('#qrModal .modal-close-button')?.addEventListener('click', () => {
        document.getElementById('qrModal').style.display = 'none';
    });
    document.getElementById('printQrButton')?.addEventListener('click', printQrCode);
}

function initDashboardPage() {
    checkAuthentication();
    setupDashboardListeners();
    document.querySelector('.section-nav button[data-section="datangSection"]')?.click();
}

function initLoginPage() {
    checkAuthentication();
    setupPasswordToggle();
    document.querySelector('.login-box form')?.addEventListener('submit', (e) => { 
        e.preventDefault(); 
        handleLogin(); 
    });
}

// ====================================================================
// TAHAP 5: TITIK MASUK APLIKASI (ENTRY POINT)
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('dashboard.html')) {
        initDashboardPage();
    } else {
        initLoginPage();
    }
});
