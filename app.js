/**
 * =================================================================
 * SCRIPT UTAMA FRONTEND - SISTEM PRESENSI QR CODE (VERSI REFACTORED)
 * =================================================================
 * @version 2.0 - Refactored with Best Practices
 * @author Gemini AI Expert for User
 *
 * PERUBAHAN UTAMA (REFACTOR):
 * - [REFACTOR] State aplikasi disatukan dalam satu objek `AppState`.
 * - [REFACTOR] Membuat fungsi pembantu `makeApiCall` untuk menangani semua request `fetch`,
 *   mengurangi duplikasi kode dan menyederhanakan penanganan error.
 * - [FITUR] Menambahkan umpan balik suara sederhana untuk scan berhasil/gagal.
 * - [OPTIMASI] Logika start/stop scanner yang lebih andal untuk mencegah kebocoran memori.
 */

// ====================================================================
// TAHAP 1: KONFIGURASI GLOBAL DAN STATE APLIKASI
// ====================================================================

// GANTI DENGAN URL GOOGLE APPS SCRIPT ANDA
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby-tvNoDtkx3jID_oqWDItDVWRfQwhVPl0ByWqdD3LX6z2Rp8FuvcexZ1NrWdLMI6dLMw/exec";

// State Aplikasi Terpusat
const AppState = {
    siswa: [],
    users: [],
    rekap: [],
};

let qrScannerDatang, qrScannerPulang;
let qrCodeInstance = null;
let isScanning = { datang: false, pulang: false };

// ====================================================================
// TAHAP 2: FUNGSI-FUNGSI PEMBANTU (HELPERS)
// ====================================================================

function showLoading(isLoading) {
    const loader = document.getElementById('loadingIndicator');
    if (loader) loader.style.display = isLoading ? 'flex' : 'none';
}

function showStatusMessage(message, type = 'info', duration = 5000) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) { alert(message); return; }
    
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    window.scrollTo(0, 0);
    setTimeout(() => { statusEl.style.display = 'none'; }, duration);
}

function playSound(type) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);

    if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    } else { // error
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
    }

    oscillator.start(audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
    oscillator.stop(audioContext.currentTime + 0.3);
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
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const result = await response.json();
        if (result.status === 'success') {
            return result; // Mengembalikan seluruh objek hasil
        } else {
            throw new Error(result.message || 'Terjadi kesalahan pada server.');
        }
    } catch (error) {
        showStatusMessage(`Kesalahan: ${error.message}`, 'error');
        playSound('error'); // Mainkan suara error jika ada masalah API
        return null;
    } finally {
        showLoading(false);
    }
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
        // Sembunyikan manajemen pengguna jika bukan Admin
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

    const result = await makeApiCall(SCRIPT_URL, { method: 'POST', body: formData });
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
    const onScanSuccess = (decodedText) => {
        if (type === 'datang') qrScannerDatang.pause(true);
        if (type === 'pulang') qrScannerPulang.pause(true);
        processQrScan(decodedText, type);
        setTimeout(() => {
            if (type === 'datang' && qrScannerDatang) qrScannerDatang.resume();
            if (type === 'pulang' && qrScannerPulang) qrScannerPulang.resume();
        }, 3000);
    };

    const scanner = new Html5QrcodeScanner(scannerId, { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    scanner.render(onScanSuccess, () => {});
    
    if (type === 'datang') qrScannerDatang = scanner;
    else qrScannerPulang = scanner;
    
    isScanning[type] = true;
    document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang').textContent = "Arahkan kamera ke QR Code Siswa";
}

function stopQrScanner(type) {
    const scanner = type === 'datang' ? qrScannerDatang : qrScannerPulang;
    if (scanner && isScanning[type]) {
        scanner.clear().catch(err => console.error(`Gagal menghentikan scanner ${type}:`, err));
        isScanning[type] = false;
    }
}

async function processQrScan(qrData, type) {
    const resultEl = document.getElementById(type === 'datang' ? 'scanResultDatang' : 'scanResultPulang');
    const body = JSON.stringify({ action: 'recordAttendance', qrData, type });
    const result = await makeApiCall(SCRIPT_URL, { method: 'POST', body });
    
    if (result) {
        playSound('success');
        resultEl.className = 'scan-result success';
        resultEl.innerHTML = `<strong>${result.message}</strong><br>${result.nama} (${qrData}) - ${result.waktu}`;
        const logTable = document.getElementById(type === 'datang' ? 'logTableBodyDatang' : 'logTableBodyPulang');
        const newRow = logTable.insertRow(0);
        newRow.innerHTML = `<td>${result.waktu}</td><td>${qrData}</td><td>${result.nama}</td>`;
    } else {
        // Pesan error sudah ditampilkan oleh makeApiCall
        resultEl.className = 'scan-result error';
        resultEl.textContent = document.getElementById('statusMessage').textContent; // Ambil pesan error dari status
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
        renderRekapTable([]); // Kosongkan tabel jika gagal
    }
}

function renderRekapTable(data) {
    const tableBody = document.getElementById('rekapTableBody');
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Tidak ada data rekap ditemukan.</td></tr>';
        return;
    }
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td data-label="Tanggal">${row.Tanggal}</td><td data-label="NISN">${row.NISN}</td><td data-label="Nama">${row.Nama}</td><td data-label="Datang">${row.WaktuDatang}</td><td data-label="Pulang">${row.WaktuPulang}</td><td data-label="Status">${row.Status}</td>`;
        tableBody.appendChild(tr);
    });
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
    tableBody.innerHTML = '';
    if (siswaArray.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Data siswa tidak ditemukan.</td></tr>';
        return;
    }
    siswaArray.forEach(siswa => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td data-label="NISN">${siswa.NISN}</td><td data-label="Nama">${siswa.Nama}</td><td data-label="Kelas">${siswa.Kelas}</td>
            <td data-label="Aksi">
                <button class="btn btn-sm btn-primary" onclick="generateQRHandler('${siswa.NISN}')">QR Code</button>
                <button class="btn btn-sm btn-secondary" onclick="editSiswaHandler('${siswa.NISN}')">Ubah</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSiswaHandler('${siswa.NISN}')">Hapus</button>
            </td>`;
        tableBody.appendChild(tr);
    });
}

async function saveSiswa() {
    const form = document.getElementById('formSiswa');
    const oldNisn = document.getElementById('formNisnOld').value;
    const action = oldNisn ? 'updateSiswa' : 'addSiswa';
    const body = {
        action: action,
        NISN: document.getElementById('formNisn').value,
        Nama: document.getElementById('formNama').value,
        Kelas: document.getElementById('formKelas').value,
        oldNisn: oldNisn,
    };
    
    const result = await makeApiCall(SCRIPT_URL, { method: 'POST', body: JSON.stringify(body) });
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
        const body = JSON.stringify({ action: 'deleteSiswa', nisn });
        const result = await makeApiCall(SCRIPT_URL, { method: 'POST', body });
        if (result) {
            showStatusMessage(result.message, 'success');
            loadSiswa();
        }
    }
}

function generateQRHandler(nisn) {
    const siswa = AppState.siswa.find(s => s.NISN == nisn);
    if (!siswa) return;
    const modal = document.getElementById('qrModal');
    const canvas = document.getElementById('qrCodeCanvas');
    canvas.innerHTML = '';
    document.getElementById('qrModalStudentName').textContent = `QR Code: ${siswa.Nama}`;
    document.getElementById('qrModalStudentNisn').textContent = `NISN: ${siswa.NISN}`;
    
    qrCodeInstance = new QRCode(canvas, { text: siswa.NISN.toString(), width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
    modal.style.display = 'flex';
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
    if (result) {
        AppState.users = result.data;
        renderUsersTable(AppState.users);
    }
}

function renderUsersTable(usersArray) {
    const tableBody = document.getElementById('penggunaResultsTableBody');
    tableBody.innerHTML = '';
    if (usersArray.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Belum ada pengguna.</td></tr>';
        return;
    }
    usersArray.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td data-label="Nama">${user.nama}</td><td data-label="Username">${user.username}</td><td data-label="Peran">${user.peran}</td>
            <td data-label="Aksi">
                <button class="btn btn-sm btn-secondary" onclick="editUserHandler('${user.username}')">Ubah</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUserHandler('${user.username}')">Hapus</button>
            </td>`;
        tableBody.appendChild(tr);
    });
}

async function saveUser() {
    const oldUsername = document.getElementById('formUsernameOld').value;
    const action = oldUsername ? 'updateUser' : 'addUser';
    const password = document.getElementById('formPassword').value;
    if (action === 'addUser' && !password) return showStatusMessage('Password wajib diisi untuk pengguna baru.', 'error');

    const body = {
        action: action,
        nama: document.getElementById('formNamaPengguna').value,
        username: document.getElementById('formUsername').value,
        password: password,
        peran: document.getElementById('formPeran').value,
        oldUsername: oldUsername,
    };

    const result = await makeApiCall(SCRIPT_URL, { method: 'POST', body: JSON.stringify(body) });
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
    const passwordInput = document.getElementById('formPassword');
    passwordInput.value = '';
    passwordInput.placeholder = 'Kosongkan jika tidak diubah';
    document.getElementById('savePenggunaButton').textContent = 'Update Pengguna';
    document.getElementById('formPengguna').scrollIntoView({ behavior: 'smooth' });
}

async function deleteUserHandler(username) {
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    if (loggedInUser && loggedInUser.username === username) return showStatusMessage('Anda tidak dapat menghapus akun Anda sendiri.', 'error');
    if (confirm(`Yakin ingin menghapus pengguna '${username}'?`)) {
        const body = JSON.stringify({ action: 'deleteUser', username });
        const result = await makeApiCall(SCRIPT_URL, { method: 'POST', body });
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
    document.getElementById('formPassword').placeholder = 'Isi password baru';
}

// ====================================================================
// TAHAP 4: INISIALISASI DAN EVENT LISTENERS
// ====================================================================

function setupDashboardListeners() {
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);

    const navButtons = document.querySelectorAll('.section-nav button');
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            stopQrScanner('datang');
            stopQrScanner('pulang');

            const sectionId = button.dataset.section;
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = section.id === sectionId ? 'block' : 'none';
            });

            if (sectionId === 'datangSection') startQrScanner('datang');
            else if (sectionId === 'pulangSection') startQrScanner('pulang');
            else if (sectionId === 'rekapSection') {
                const today = new Date().toISOString().slice(0, 10);
                document.getElementById('rekapFilterTanggalMulai').value = today;
                document.getElementById('rekapFilterTanggalSelesai').value = today;
                loadRekapPresensi();
            }
            else if (sectionId === 'siswaSection') loadSiswa();
            else if (sectionId === 'penggunaSection') loadUsers();
        });
    });

    // Tombol dan Form Lainnya
    document.getElementById('filterRekapButton')?.addEventListener('click', loadRekapPresensi);
    document.getElementById('exportRekapButton')?.addEventListener('click', exportRekapToExcel);
    document.getElementById('formSiswa')?.addEventListener('submit', (e) => { e.preventDefault(); saveSiswa(); });
    document.getElementById('resetSiswaButton')?.addEventListener('click', resetFormSiswa);
    document.getElementById('formPengguna')?.addEventListener('submit', (e) => { e.preventDefault(); saveUser(); });
    document.getElementById('resetPenggunaButton')?.addEventListener('click', resetFormPengguna);

    // Modal QR
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
    document.getElementById('loginButton')?.addEventListener('click', handleLogin);
    document.querySelector('.login-box form')?.addEventListener('submit', (e) => { e.preventDefault(); handleLogin(); });
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
