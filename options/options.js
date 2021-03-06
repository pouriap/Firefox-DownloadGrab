// load current options when page is loaded
document.addEventListener("DOMContentLoaded", loadOptions);

// save options when save is clicked
document.querySelector("form").addEventListener("submit", saveOptions);


async function saveOptions(e) {

	e.preventDefault();

	let optionsData = Options.optionsData;

	let optionsToSave = {};

	for(optionName in optionsData){
		let optionType = optionsData[optionName].type;
		let e = document.getElementById(optionName);
		if(!e){
			continue;
		}
		switch(optionType){
			case 'textbox':
				optionsToSave[optionName] = e.value;
				break;
			case 'checkbox':
				optionsToSave[optionName] = e.checked;
				break;
			case 'dropdown':
				optionsToSave[optionName] = e.value;
				break;
		}
	}

	//options are save in local storage but we need to update app.options too
	let message = {
		type: Messaging.TYP_SAVE_OPTIONS,
		options: optionsToSave
	};

	browser.runtime.sendMessage(message);

}

async function loadOptions() {

	let currOptions = await browser.runtime.sendMessage({type: Messaging.TYP_LOAD_OPTIONS});

	console.log("got the options: ", currOptions);

	for(let key in currOptions){
		let option = currOptions[key];
		let optionDiv = document.createElement('div');
		optionDiv.setAttribute('class', 'panel-formElements-item');
		optionDiv.appendChild(createLabel(option));
		optionDiv.appendChild(createElement(option));
		document.getElementById('options-form').appendChild(optionDiv);
		if(option.endsection){
			let hr = document.createElement('hr');
			document.getElementById('options-form').appendChild(hr);
		}
	}

	let btn = document.createElement('button');
	btn.setAttribute('class', 'browser-style');
	btn.setAttribute('type', 'submit');
	btn.innerHTML = "Save";
	document.getElementById('options-form').appendChild(btn);
	
}

function createLabel(option){
	let label = document.createElement('label');
	label.setAttribute("for", option.name);
	label.innerHTML = option.desc;
	return label;
}

function createElement(option){
	var e;
	switch (option.type) {
		case 'textbox':
			e = createTextBox(option);
			break;
		case 'checkbox':
			e = createCheckBox(option);
			break;
		case 'dropdown':
			e = createDropDown(option);
			break;
	}
	e.setAttribute("id", option.name);
	if(option.attrs){
		for(let attr of option.attrs){
			e.setAttribute(attr.name, attr.value);
		}
	}
	return e;
}

function createCheckBox(option){
	let checkBox = document.createElement("input");
	checkBox.setAttribute("type", "checkbox");
	checkBox.setAttribute("id", option.name);
	checkBox.checked = option.value;
	return checkBox;
}

function createTextBox(option){
	let txtBox = document.createElement("input");
	txtBox.setAttribute("type", "text");
	txtBox.setAttribute("id", option.name);
	txtBox.value = option.value;
	return txtBox;
}

function createDropDown(option){

	//populate available DMs
	let itemsList = option.extra;

	let dropDwn = document.createElement("select");
	dropDwn.setAttribute("id", option.name);

	for(let itemName of itemsList){
		let item = document.createElement('option');
		item.value = itemName;
		item.innerHTML = itemName;
		item.id = itemName;
		item.onclick = function(){
			let selectedItem = dropDwn.options[dropDwn.selectedIndex].value;
			document.getElementById(option.name).value = selectedItem;
		};
		dropDwn.appendChild(item);
		//is this the selected one?
		if(option.value === item.value){
			item.setAttribute('selected', 'selected');
			dropDwn.value = option.value;
		}
	}

	return dropDwn;

}