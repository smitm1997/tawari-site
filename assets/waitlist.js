// Waitlist: one insert into public.waitlist through Supabase's REST API with the publishable
// key. Row-level security on the table allows anon INSERT only. The same form sits at the foot
// of every page (tools/build_chrome.py); the page's <html lang> picks the messages.
(function () {
  var URL = 'https://yiwgwojxuisdqfvxlciu.supabase.co/rest/v1/waitlist';
  var KEY = 'sb_publishable_mxH-YkTK-XC0DHm3KndsQw_IhlfsHcq';
  var form = document.getElementById('waitlist-form');
  if (!form) return;
  var en = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var T = en ? {
    email: 'Please enter a valid email.',
    consent: 'We need your permission to write to you.',
    done: "Done. We'll write when your beta invitation is ready.",
    saving: 'Saving…',
    already: 'That email is already on the list.',
    fail: "We couldn't save it. Email hello@tawari.id and we'll add you by hand."
  } : {
    email: 'Escribe un correo válido.',
    consent: 'Necesitamos tu autorización para escribirte.',
    done: 'Listo. Te escribimos cuando tu invitación a la beta esté lista.',
    saving: 'Guardando…',
    already: 'Ese correo ya está en la lista.',
    fail: 'No pudimos guardarlo. Escríbenos a hola@tawari.id y te apuntamos a mano.'
  };
  var msg = document.getElementById('formMsg');
  var btn = document.getElementById('submit');
  function say(cls, text) { msg.className = 'form-msg ' + cls; msg.textContent = text; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('email').value.trim();
    var country = document.getElementById('country').value;
    var consent = document.getElementById('consent').checked;
    var trap = form.elements.website.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say('err', T.email); return; }
    if (!consent) { say('err', T.consent); return; }
    if (trap) { say('ok', T.done); form.reset(); return; }
    btn.disabled = true; say('', T.saving);
    fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email: email, country: country, lang: en ? 'en' : 'es', source: 'landing', consent: true, consent_at: new Date().toISOString() })
    }).then(function (r) {
      if (r.status === 201) { say('ok', T.done); form.reset(); }
      else if (r.status === 409) { say('ok', T.already); form.reset(); }
      else { throw new Error('status ' + r.status); }
    }).catch(function () {
      say('err', T.fail);
    }).then(function () { btn.disabled = false; });
  });
})();
