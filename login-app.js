import { auth, persistenceReady } from './firebase-config.js';
import {
  GoogleAuthProvider, signInWithPopup, RecaptchaVerifier,
  signInWithPhoneNumber, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

const $ = (id) => document.getElementById(id);
const message = $('authMessage');
const phoneInput = $('adminPhone');
const otpArea = $('otpArea');
let verifier;
let confirmation;

function say(text, kind = '') {
  message.textContent = text;
  message.className = `auth-message ${kind}`;
}

async function requireAdmin(user) {
  const token = await user.getIdTokenResult(true);
  if (token.claims.admin === true) {
    location.replace('index.html');
    return true;
  }
  await signOut(auth);
  say('This account is signed in, but it has not been granted administrator access. Ask the project owner to assign the admin claim.', 'error');
  return false;
}

await persistenceReady;
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try { await requireAdmin(user); }
  catch (error) { say(`Access check failed: ${error.message}`, 'error'); }
});

$('googleSignIn').addEventListener('click', async () => {
  const button = $('googleSignIn');
  button.disabled = true;
  say('Opening Google sign-in…');
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    await requireAdmin(auth.currentUser);
  } catch (error) {
    say(error.message || 'Google sign-in could not be completed.', 'error');
  } finally { button.disabled = false; }
});

$('sendOtp').addEventListener('click', async () => {
  const digits = phoneInput.value.replace(/\D/g, '').slice(0, 10);
  if (!/^[6-9]\d{9}$/.test(digits)) return say('Enter a valid 10-digit Indian mobile number.', 'error');
  $('sendOtp').disabled = true;
  try {
    if (!verifier) verifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    confirmation = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
    otpArea.hidden = false;
    $('adminOtp').focus();
    say('Verification code sent. Check your phone.');
  } catch (error) {
    verifier?.clear(); verifier = null;
    say(error.message || 'Could not send the verification code.', 'error');
  } finally { $('sendOtp').disabled = false; }
});

$('phoneForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = $('adminOtp').value.trim();
  if (!confirmation || !/^\d{6}$/.test(code)) return say('Enter the 6-digit verification code first.', 'error');
  try {
    say('Verifying code…');
    await confirmation.confirm(code);
    await requireAdmin(auth.currentUser);
  } catch (error) {
    say(error.message || 'The code could not be verified.', 'error');
  }
});
