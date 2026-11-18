(() => {
  const heroButton = document.getElementById("hero-cta");
  const capture = document.getElementById("cadastro");
  const mobileAction = document.getElementById("mobile-action");
  if (!heroButton || !capture || !mobileAction || !("IntersectionObserver" in window)) return;

  let heroVisible = true;
  let captureVisible = false;
  const updateAction = () => { mobileAction.hidden = heroVisible || captureVisible; };

  const heroObserver = new IntersectionObserver((entries) => {
    heroVisible = entries[0].isIntersecting;
    updateAction();
  });
  const captureObserver = new IntersectionObserver((entries) => {
    captureVisible = entries[0].isIntersecting;
    updateAction();
  });
  heroObserver.observe(heroButton);
  captureObserver.observe(capture);
})();
