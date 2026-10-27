const Cloud = window.MealCloud;
const backupKey = `onboarding_backup:${Cloud.state.user.id}`;
const temporaryKeys = ['meal_request', 'last_recommendation', 'selected_meal'];
const message = document.getElementById('message');
document.getElementById('restore').hidden = !sessionStorage.getItem(backupKey);
document.getElementById('restart').addEventListener('click', async () => {
  try {
    sessionStorage.setItem(backupKey, JSON.stringify({ profile: Cloud.state.profile, savedAt: new Date().toISOString() }));
    await Cloud.saveProfile(null);
    temporaryKeys.forEach(key => sessionStorage.removeItem(key));
    location.replace('page1_guide.html');
  } catch (error) { message.textContent = error.message; document.getElementById('restore').hidden = false; }
});
document.getElementById('restore').addEventListener('click', async () => {
  try {
    const backup = JSON.parse(sessionStorage.getItem(backupKey));
    if (!backup || !Object.hasOwn(backup, 'profile')) throw new Error('没有可恢复的偏好');
    await Cloud.saveProfile(backup.profile);
    location.replace('index.html');
  } catch (error) { message.textContent = error.message; }
});
