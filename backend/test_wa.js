const payload = {
  org_id: 'c6705bb7-815b-4bd9-8a22-85b2f7ad7916',
  user_email: 'getaipilott@gmail.com',
  lead_id: '2c84ef08-5154-489a-8d63-cc83f1caa2f1',
  phone: '+917082892696',
  template_id: 'gap_lead_welcome_offer',
  variables: { name: 'Ank' }
};

fetch('http://localhost:3001/api/ecosystem/trigger-whatsapp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-ecosystem-secret': 'super_secret_ecosystem_key_2024'
  },
  body: JSON.stringify(payload)
})
.then(res => res.json().then(data => console.log(res.status, data)))
.catch(err => console.error(err));
