angular.module('10digit.payment', ['ui.validate', '10digit.utils'])

.factory('PaymentConfig', function(){
    var config = {
        testMode: false,
        stripeKey: '',
        initialValues: {
            card: {
				name: 'Calvin Froedge',
				number: '4242424242424242',
				expiration: '082021',
				cvc: 234,
				billing_country: 'US',
				billing_state: 'KY',
				address_line1: '181 FooBar Street',
				address_city: 'Tompkinsville',
				address_zip: 42167
            }
        }
    };

    return config;
})

.factory('StripeApp',['PaymentConfig', function(Config){
	var Stripe = window.Stripe || {};
	if(Stripe.setPublishableKey){
		Stripe.setPublishableKey(Config.stripeKey)
	}

	return Stripe;
}])

.factory('CreditCard',['StripeApp', '$ajax', function(StripeApp, $ajax){
	var that = this;

	var paymentMethods = [];

	var CreditCardError = {};
	angular.extend(CreditCardError, Object.create(Error.prototype));

	that.getExpDiscrete = function(mmyyyy){
		var obj = {
			mm: mmyyyy.slice(0, 2),
			yyyy: mmyyyy.slice(2)
		};

		return obj;
	}

	function prepareForUI(card){
		card.last4 = angular.copy(card.last_4);
		delete card.last_4;
		if(card.month.length == 1){
			card.exp_month = "0"+angular.copy(card.month);
		} else {
			card.exp_month = angular.copy(card.month);
		}
		delete card.month;
		card.exp_year = card.year;
		delete card.year;
	}

	function createToken(opts){
		var required = ['number', 'cvc', 'exp_month', 'exp_year'];
		var missing = [];
		for(var i=0;i<required.length;i++){
			var arg = required[i];
			if(!opts[arg]) missing.push(arg);
		}

		CreditCardError.message = missing.join(', ') + ' are required arguments.';
		if(missing.length > 0) throw CreditCardError;

		function responseHandler(status, response){
			console.log(status, response);
			if(response.error){
				if(opts.error) opts.error(status, response);
			} else {
				if(opts.success) opts.success(status, response);

				that.token = response.id;
			}
		}

		Stripe.card.createToken({
			number: opts.number,
			cvc: opts.cvc,
			exp_month: opts.exp_month,
			exp_year: opts.exp_year,
			name: opts.name || '',
			address_line1: opts.address_line1 || '',
			address_city: opts.address_city || '',
			address_state: opts.address_state || '',
			address_zip: opts.address_zip || '',
			address_country: opts.address_country || ''
		}, responseHandler);
	}

	return {
		validate: {
			expiry: function(s){
				var discrete = (s) ? that.getExpDiscrete(s) : false;
				return (discrete) ? StripeApp.card.validateExpiry(discrete.mm, discrete.yyyy) : false;
			},
			number: function(n){
				return StripeApp.card.validateCardNumber(n);
			},
			cvc: function(n){
				return StripeApp.card.validateCVC(n);
			}
		},
		formatExpiry: function(mmyyyy){
			return that.getExpDiscrete(mmyyyy);
		},
		type: function(n){
			return StripeApp.card.cardType(n);
		},
		createToken: function(opts){
			createToken(opts);
		},
		token: function(){
			return that.token || '';
		},
		paymentMethods: paymentMethods,
		load: function(){
			$ajax.run('members/me/payment-methods', {
				success: function(res, status){
					for(var i=0;i<res.length;i++){
						prepareForUI(res[i]);
						paymentMethods.push(res[i]);
					}
				}
			})
		},
		remove: function(card, opts){
			$ajax.run('members/me/payment-methods/'+card.id, {
				method: 'DELETE',
				success: function(res, status){
					if(opts.success){
						opts.success(res, status);
					}
					paymentMethods.remove(card);
				}
			});
		},
		add: function(card, cardOpts){
			var finalSuccess = false;
			if(cardOpts.success){
				finalSuccess = cardOpts.success;
			}
			var success = function(status, response){
				var submit = {
					last_4: response.card.last4,
					month: response.card.exp_month,
					year: response.card.exp_year,
					token: response.id,
					type: response.card.type
				};

				$ajax.run('members/me/payment-methods', {
					method: 'POST',
					data: submit,
					success: function(res, status){
						paymentMethods.push(response.card);
						if(finalSuccess){
							finalSuccess(res, status);
							delete card;
						}
					}
				});
			}
			var exp = that.getExpDiscrete(card.expiration);
			card.exp_month = exp.mm;
			card.exp_year = exp.yyyy;
			cardOpts.success = success;
			var args = angular.extend(card, cardOpts);
			createToken(args);
		}
	}
}])

.controller('PaymentInfoCtrl',['$rootScope', '$scope', 'CreditCard', 'PaymentConfig', function($rootScope, $scope, CreditCard, Config){
	$scope.cards = CreditCard.paymentMethods;
	if(!$scope.signup)
		CreditCard.load();

	$scope.validate = CreditCard.validate;

	$scope.addCard = function(card){
		$rootScope.$broadcast('card_added', card);
	}

	$scope.deleteCard = function(card){
		$rootScope.$broadcast('card_deleted', card);
	}

	$scope.new_card = {};

	if(Config.testMode){
		$scope.new_card = Config.initialValues.card;
	}

	$scope.CreditCard = CreditCard;

	$scope.remove = function(card){
        $scope.info = "Deleting card...";
		CreditCard.remove(card, {
			success: function(res, status){
				$scope.success = "Successfully removed card.";
			}
		});
		return false;
	}

	$scope.add = function(card){
        $scope.info = "Saving card data...";
		CreditCard.add(card, {
			success: function(res, status){
				$scope.success = "Successfully created card.";
                $scope.info = undefined;
                $scope.new_card = {};
			}
		});
	}
}])

.directive('paymentInformation', function(){
	return {
		restrict:'E',
		controller:'PaymentInfoCtrl',
		replace: true,
		templateUrl: 'template/10digit/payment-info.html',
		link: function(scope, elm, attrs){
		}
	}
});
